import openapiTS, { astToString, OpenAPI3 } from 'openapi-typescript';
import ts from 'typescript';
import {
  hoistSharedTypes,
  rewriteEnumsAsObjects,
  toSchemaObject
} from '../utils';
import { GenerateTypesOptions, RoutePathConfig } from '../types';
import {
  ACCOUNT_MODULE_TYPE,
  ACCOUNT_TYPES,
  AUTH_MODULE_TYPE,
  AUTH_TYPES,
  CONFIG_FIELD,
  HEALTH_MODULE_TYPE,
  HEALTH_TYPES,
  RESOURCE_MODULE_TYPE,
  RESOURCE_TYPES
} from '../constants';

/**
 * Generates TypeScript types based on an OpenAPI V3 schema content.
 *
 * @param {string | OpenAPI3} schema - The OpenAPI V3 schema to generate types from. The value can be a string
 * representing JSON or YAML format, or an already parsed OpenAPI3 object.
 * @param {GenerateTypesOptions} [options] - Options controlling how the types are emitted.
 * @return {Promise<string>} A promise that resolves to a string containing the generated TypeScript types.
 */
export async function generateTypes(
  schema: string | OpenAPI3,
  options: GenerateTypesOptions = {}
): Promise<string> {
  // The schema is copied before the shared definitions are hoisted into it, so
  // the caller keeps the schema it passed in unchanged
  const schemaObject =
    typeof schema === 'string'
      ? await toSchemaObject(schema)
      : structuredClone(schema);
  const sharedTypes = hoistSharedTypes(schemaObject);

  const ast = await openapiTS(schemaObject, {
    exportType: true,
    emptyObjectsUnknown: true,
    enum: true,
    enumValues: true,
    transformProperty: (property, schemaObject) => {
      const validationTags: string[] = [];

      // Add validation JSDoc tags based on schema constraints
      if (schemaObject['minLength'] !== undefined) {
        validationTags.push(`@minLength ${schemaObject['minLength']}`);
      }
      if (schemaObject['maxLength'] !== undefined) {
        validationTags.push(`@maxLength ${schemaObject['maxLength']}`);
      }
      if (schemaObject['minimum'] !== undefined) {
        validationTags.push(`@minimum ${schemaObject['minimum']}`);
      }
      if (schemaObject['maximum'] !== undefined) {
        validationTags.push(`@maximum ${schemaObject['maximum']}`);
      }
      if (schemaObject['pattern'] !== undefined) {
        validationTags.push(`@pattern ${schemaObject['pattern']}`);
      }
      if (schemaObject['format'] !== undefined) {
        validationTags.push(`@format ${schemaObject['format']}`);
      }

      if (validationTags.length > 0) {
        const newProperty = ts.factory.updatePropertySignature(
          property,
          property.modifiers,
          property.name,
          property.questionToken,
          property.type
        );

        const jsDocText = `*\n * ${validationTags.join('\n * ')}\n `;
        ts.addSyntheticLeadingComment(
          newProperty,
          ts.SyntaxKind.MultiLineCommentTrivia,
          jsDocText,
          true
        );

        return newProperty;
      }

      return property;
    }
  });

  let typesContent = astToString(deduplicateUnionConstituents(ast));
  typesContent = extractSchemaTypes(typesContent, sharedTypes);
  typesContent = combineModuleTypes(typesContent, schemaObject);
  typesContent = deduplicateExportedTypes(typesContent);
  typesContent = replaceFileUploadTypes(typesContent);
  return rewriteEnumsAsObjects(typesContent, options.declaration);
}

/**
 * Extracts inline schema types from the generated `schemas` block.
 *
 * Finds entries like:
 *   /** SomeTypeName *\/
 *   "def-N": { ... };
 *
 * Lifts each one into:
 *   export type SomeTypeName = { ... };
 *
 * And replaces the inline body in `schemas` with a reference to the new type.
 *
 * The definitions holding the schemas shared between the other definitions are lifted the
 * same way, whether they hold an object or, as the hoisted enums and filter values do, a
 * union of their own.
 *
 * @param {string} typeContent - The generated TypeScript type content as a string.
 * @param {string[]} sharedTypes - The names of the definitions holding the schemas shared
 * between the other definitions, whose references are replaced by the name alone.
 * @return {string} The transformed types content with extracted schema types.
 */
function extractSchemaTypes(
  typeContent: string,
  sharedTypes: string[] = []
): string {
  const extractedTypes: string[] = [];
  const typeNames = new Set<string>();

  // Collect all matches with their positions first, then build the result in one pass.
  interface Entry {
    start: number; // index of /** ...
    headerEnd: number; // index of the opening { of the body
    typeName: string;
    body: string; // the full { ... } including nested braces
    end: number; // index after the closing '}';
  }

  const entries: Entry[] = [];
  // Maps "def-N" key → extracted type name, used to replace cross-references
  const defToTypeName = new Map<string, string>();

  // Matches the JSDoc header of a definition, capturing its name, which is the first
  // word of the comment, whether it stands alone or is followed by the description and
  // the tags of the definition. The body of the comment is matched one character at a
  // time, so that a header never spans the comments of the definitions before it.
  const headerComment = String.raw`\/\*\*[\s*]*(\w+)(?:(?!\*\/)[\s\S])*\*\/`;

  // Replace Record<...> types with object types so schema type can be extracted
  const normalizedTypes = typeContent.replace(
    new RegExp(
      `(${headerComment}\\s*"def-\\d+"):\\s*Record<(\\w+), (\\w+)>;`,
      'g'
    ),
    `$1: { [key: $3]: $4 };`
  );

  let m: RegExpExecArray | null;
  // Also capture the "def-N" key from the header
  const headerPatternWithKey = new RegExp(
    `${headerComment}\\s*("def-\\d+"):\\s*(?=\\{)`,
    'g'
  );
  while ((m = headerPatternWithKey.exec(normalizedTypes)) !== null) {
    const typeName = m[1];
    const defKey = m[2]; // e.g. "def-89"
    const headerEnd = m.index + m[0].length; // points at '{'

    // Walk forward counting braces to find the matching closing '}'
    let depth = 0;
    let i = headerEnd;
    for (; i < normalizedTypes.length; i++) {
      if (normalizedTypes[i] === '{') {
        depth++;
      } else if (normalizedTypes[i] === '}') {
        depth--;
        if (depth === 0) {
          break;
        }
      }
    }

    // Variable i is now the index of the closing '}'
    // The entry ends after '}' followed by ';'
    const bodyEnd = i; // index of closing '}'
    const entryEnd =
      normalizedTypes[bodyEnd + 1] === ';' ? bodyEnd + 2 : bodyEnd + 1;

    defToTypeName.set(defKey, typeName);
    entries.push({
      start: m.index,
      headerEnd,
      typeName,
      body: normalizedTypes.slice(headerEnd, bodyEnd + 1),
      end: entryEnd
    });
  }

  if (entries.length === 0) {
    return normalizedTypes;
  }

  // Build updated content by replacing each entry's body with the type name reference
  let updatedBaseContent = '';
  let cursor = 0;
  for (const entry of entries) {
    // Append everything up to the opening brace of the body
    updatedBaseContent += normalizedTypes.slice(cursor, entry.headerEnd);
    // Replace body with the extracted type name
    updatedBaseContent += entry.typeName + ';';
    cursor = entry.end;

    // Collect the exported type (deduplicate)
    if (!typeNames.has(entry.typeName)) {
      typeNames.add(entry.typeName);
      extractedTypes.push(`export type ${entry.typeName} = ${entry.body}\n`);
    }
  }
  updatedBaseContent += normalizedTypes.slice(cursor);

  // Lift the shared definitions holding a union rather than an object, which the
  // entries above leave in place (i.e. `QueryFilterValue: QueryFilterScalar | ...;`)
  updatedBaseContent = extractSharedTypes(
    updatedBaseContent,
    sharedTypes,
    extractedTypes,
    typeNames
  );

  // Replace all cross-references like components["schemas"]["def-89"] with the type name
  const references = new Map<string, string>(
    sharedTypes.map((name) => [`"${name}"`, name])
  );
  for (const [defKey, typeName] of defToTypeName) {
    references.set(defKey, typeName);
  }

  for (const [defKey, typeName] of references) {
    // The defKey already includes surrounding quotes, e.g. "def-89"
    const refPattern = new RegExp(
      `components\\["schemas"]\\[${defKey}\\]`,
      'g'
    );
    updatedBaseContent = updatedBaseContent.replace(refPattern, typeName);
    extractedTypes.forEach((t, idx) => {
      extractedTypes[idx] = t.replace(refPattern, typeName);
    });
  }

  // Rename the enums generated for the properties of a definition (i.e. `Def89Status`)
  // after the type extracted from it (i.e. `PostSingleStatus`), declarations and
  // references alike. The digits are matched as a whole, so a definition number is never
  // mistaken for the prefix of a longer one (i.e. `Def12` inside of `Def125Status`).
  const renameEnums = (content: string): string =>
    content.replace(/\bDef(\d+)([A-Z]\w*)\b/g, (match, id, property) => {
      const typeName = defToTypeName.get(`"def-${id}"`);
      return typeName ? `${typeName}${property}` : match;
    });

  updatedBaseContent = renameEnums(updatedBaseContent);
  extractedTypes.forEach((t, idx) => {
    extractedTypes[idx] = renameEnums(t);
  });

  // Remove redundant "Format: ..." prose lines since the @format tag already captures this.
  // If the line ends with */ (end-of-comment), preserve the closing; otherwise remove entirely.
  const redundantFormatRegex = /\n(\s*)\* Format: [^\n]*/g;
  const stripFormat = (s: string) =>
    s.replace(redundantFormatRegex, (m, g) =>
      m.endsWith('*/') ? `\n${g}*/` : ''
    );

  // Merge consecutive multiline comment endings and openings: */ \n /** → *
  const doubleCommentsRegex = /(\s*)\*\/\s*\n\s*\/\*\*/g;
  updatedBaseContent = stripFormat(
    updatedBaseContent.replace(doubleCommentsRegex, '$1*')
  );
  const joined = extractedTypes.join('\n');
  const mergedExtractedTypes = stripFormat(
    joined.replace(doubleCommentsRegex, '$1*')
  );

  return updatedBaseContent + '\n' + mergedExtractedTypes;
}

/**
 * Lifts the shared definitions holding a type of their own out of the generated `schemas`
 * block, so the type they hold is declared once and referenced by name everywhere else.
 *
 * Finds entries like:
 *   QueryFilterValue: QueryFilterScalar | QueryFilterScalar[] | QueryCondition;
 *
 * Lifts each one into:
 *   export type QueryFilterValue = QueryFilterScalar | QueryFilterScalar[] | QueryCondition;
 *
 * The definitions holding nothing but a reference to a type declared elsewhere, as the hoisted
 * enums do, are left alone.
 *
 * @param {string} content - The generated types, with the object definitions already extracted.
 * @param {string[]} names - The names of the shared definitions to lift.
 * @param {string[]} extractedTypes - The extracted types, appended to for every lifted entry.
 * @param {Set<string>} typeNames - The names already extracted, added to for every lifted entry.
 * @return {string} The types with the body of every lifted entry replaced by its name.
 */
function extractSharedTypes(
  content: string,
  names: string[],
  extractedTypes: string[],
  typeNames: Set<string>
): string {
  // The definitions live in the components block, so a property named after one of them
  // elsewhere in the types is never mistaken for its declaration
  const componentsStart = content.indexOf('export type components');
  if (componentsStart < 0) {
    return content;
  }

  for (const name of names) {
    if (typeNames.has(name)) {
      continue;
    }

    // The entry starts on a line of its own, optionally preceded by the JSDoc header
    // holding the name of the definition
    const entry = new RegExp(
      String.raw`\n[ \t]*(?:\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*)?${name}: `
    ).exec(content.slice(componentsStart));
    if (!entry) {
      continue;
    }

    const start = componentsStart + entry.index + entry[0].length;
    const end = findTypeEnd(content, start);
    const body = content.slice(start, end).trim();

    // A definition referencing a type declared elsewhere holds nothing to lift
    if (!body || body === name) {
      continue;
    }

    typeNames.add(name);
    extractedTypes.push(`export type ${name} = ${body};\n`);
    content = content.slice(0, start) + name + content.slice(end);
  }

  return content;
}

/**
 * Finds the end of the type starting at the given index, which is the first semicolon that is
 * not nested inside braces, brackets, parentheses or a string literal.
 *
 * @param {string} content - The content holding the type.
 * @param {number} start - The index the type starts at.
 * @return {number} The index of the semicolon terminating the type.
 */
function findTypeEnd(content: string, start: number): number {
  const closing: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const stack: string[] = [];

  for (let i = start; i < content.length; i++) {
    const character = content[i];

    if (character === '"' || character === "'") {
      i = content.indexOf(character, i + 1);
      if (i < 0) {
        return content.length;
      }
      continue;
    }

    if (closing[character]) {
      stack.push(closing[character]);
    } else if (character === stack[stack.length - 1]) {
      stack.pop();
    } else if (character === ';' && stack.length === 0) {
      return i;
    }
  }

  return content.length;
}

/**
 * Deduplicates and simplifies union type constituents in the provided TypeScript Abstract Syntax Tree (AST).
 * Ensures that duplicate constituents are removed and shared types across parenthesized union branches are hoisted.
 *
 * @param {ts.Node[]} ast - An array of TypeScript nodes representing the AST to process and deduplicate.
 * @return {ts.Node[]} An array of transformed TypeScript nodes with union type constituents deduplicated and simplified.
 */
function deduplicateUnionConstituents(ast: ts.Node[]): ts.Node[] {
  const printer = ts.createPrinter();
  const dummyFile = ts.createSourceFile('_.ts', '', ts.ScriptTarget.Latest);

  const printType = (node: ts.TypeNode): string =>
    printer.printNode(ts.EmitHint.Unspecified, node, dummyFile);

  const transformer: ts.TransformerFactory<ts.Node> = (context) => {
    const visit = (node: ts.Node): ts.Node => {
      // Bottom-up: fix nested unions before outer ones
      node = ts.visitEachChild(node, visit, context);

      if (!ts.isUnionTypeNode(node)) return node;

      const types = Array.from(node.types);

      // Deduplicate direct top-level members
      const seenDirect = new Set<string>();
      const deduped: ts.TypeNode[] = [];
      for (const t of types) {
        const key = printType(t);
        if (!seenDirect.has(key)) {
          seenDirect.add(key);
          deduped.push(t);
        }
      }

      // Hoist types shared across at least 2 parenthesized union branches
      const parenBranches = deduped
        .map((t, i) => ({ i, t }))
        .filter(
          ({ t }) => ts.isParenthesizedTypeNode(t) && ts.isUnionTypeNode(t.type)
        );

      if (parenBranches.length < 2) {
        // Nothing to hoist, still emit step-1 deduplication result if it changed
        if (deduped.length === types.length) return node;
        return ts.factory.createUnionTypeNode(deduped);
      }

      // Count how many branches each inner type key appears in
      const countInBranches = new Map<
        string,
        { count: number; node: ts.TypeNode }
      >();
      for (const { t } of parenBranches) {
        const innerUnion = (t as ts.ParenthesizedTypeNode)
          .type as ts.UnionTypeNode;
        const seenInBranch = new Set<string>();
        for (const inner of innerUnion.types) {
          const key = printType(inner);
          if (!seenInBranch.has(key)) {
            seenInBranch.add(key);
            if (countInBranches.has(key)) {
              countInBranches.get(key)!.count++;
            } else {
              countInBranches.set(key, { count: 1, node: inner });
            }
          }
        }
      }

      // Types that appear in at least 2 branches, or already exist directly in the outer union
      const toHoist = new Map<string, ts.TypeNode>();
      for (const [key, { count, node: n }] of countInBranches) {
        if (count >= 2 || seenDirect.has(key)) {
          toHoist.set(key, n);
        }
      }

      if (toHoist.size === 0) {
        if (deduped.length === types.length) return node;
        return ts.factory.createUnionTypeNode(deduped);
      }

      // Rebuild the union
      const result: ts.TypeNode[] = [];
      const hoistedKeys = new Set(toHoist.keys());

      for (const t of deduped) {
        if (ts.isParenthesizedTypeNode(t) && ts.isUnionTypeNode(t.type)) {
          const innerUnion = t.type;
          const remaining = innerUnion.types.filter(
            (inner) => !hoistedKeys.has(printType(inner))
          );
          if (remaining.length === 0) {
            // Branch fully absorbed — discard
          } else if (remaining.length === 1) {
            result.push(remaining[0]); // unwrap
          } else {
            result.push(
              ts.factory.createParenthesizedType(
                ts.factory.createUnionTypeNode(remaining)
              )
            );
          }
        } else {
          result.push(t);
        }
      }

      // Append each hoisted type once (skip if already present directly)
      for (const [key, hoistedNode] of toHoist) {
        if (!seenDirect.has(key)) {
          result.push(hoistedNode);
        }
      }

      return ts.factory.createUnionTypeNode(result);
    };

    return (root) => ts.visitNode(root, visit);
  };

  return ast.map((node) => ts.transform(node, [transformer]).transformed[0]);
}

/**
 * Combines various module types into a single schema definition by analyzing the provided type content.
 * The combined types are then appended to the original type content and used by the client to allow type
 * inference for client modules (e.g., AuthClient<AuthModuleType>, ResourceClient<UserResourceModuleType>, etc.)
 *
 * @param {string} typeContent The TypeScript content containing type definitions to be processed.
 * @param {OpenAPI3} schema The OpenAPI v3 schema object.
 * @return {string} A string representing the modified type content with additional module type definitions.
 */
function combineModuleTypes(typeContent: string, schema: OpenAPI3): string {
  // Map of resource names with corresponding used types
  // (e.g., User -> { single: UserSingle, ...})
  const resourceTypes: Record<string, Record<string, string>> = {};

  // Map of used auth types in generated schema
  // (e.g., { loginRequest: LoginRequest })
  const authTypes: Record<string, string> = {};

  // Map of used auth types in generated schema
  // (e.g., { statusResponse: AccountStatusResponse })
  const accountTypes: Record<string, string> = {};

  // Map of used health types in generated schema
  // (e.g., { checkResponse: HealthCheckResponse })
  const healthTypes: Record<string, string> = {};

  // Utility function for capitalizing type names
  const capitalize = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1);

  // Utility function for collecting used types
  const collectUsedTypes = (
    sourceTypes: readonly string[],
    targetObj: Record<string, string>,
    getTypeName: (type: string) => string,
    typesContent: string
  ) => {
    for (const type of sourceTypes) {
      const typeName = getTypeName(type);
      const resourcePattern = new RegExp(`export type ${typeName} = {`, 'g');
      if (resourcePattern.test(typesContent)) {
        targetObj[type] = typeName;
      } else {
        targetObj[type] = 'never';
      }
    }
  };

  // Utility function for building TypeScript type from used values
  const buildModuleType = (
    name: string,
    types: Record<string, string>
  ): string => {
    const typeValues = Object.entries(types).map(
      ([key, value]) => `${key}: ${value}`
    );
    return `export type ${name} = { ${typeValues.join(';')} };`;
  };

  // Find all resource types with used schema types
  for (const type of RESOURCE_TYPES) {
    const typeSuffix = capitalize(type);
    const resourcePattern = new RegExp(
      `export type (.+)${typeSuffix} = {`,
      'g'
    );
    let match: RegExpExecArray | null;
    while ((match = resourcePattern.exec(typeContent)) !== null) {
      const resourceName = match[1];
      resourceTypes[resourceName] ??= {};
      resourceTypes[resourceName][type] = `${resourceName}${typeSuffix}`;
    }
  }

  // Resource types that are not found in schema are set to 'never' type to
  // prevent their usage by generated client
  for (const type of RESOURCE_TYPES) {
    for (const resourceType of Object.values(resourceTypes)) {
      if (!resourceType[type]) {
        resourceType[type] = 'never';
      }
    }
  }

  // Find all used auth types
  collectUsedTypes(
    AUTH_TYPES,
    authTypes,
    (type) => capitalize(type),
    typeContent
  );

  // Extract identity type from authentication '/me' success response
  const config: Partial<RoutePathConfig> | undefined = schema[CONFIG_FIELD];
  authTypes['identity'] =
    extractResponseType(
      typeContent,
      `${config?.routePrefixes?.auth ?? '/auth'}/me`,
      'get'
    ) ?? 'never';

  // Find all used account types
  collectUsedTypes(
    ACCOUNT_TYPES,
    accountTypes,
    (type) => `Account${capitalize(type)}`,
    typeContent
  );

  // Find all used health types
  collectUsedTypes(
    HEALTH_TYPES,
    healthTypes,
    (type) => `Health${capitalize(type)}`,
    typeContent
  );

  // Combine all module types into a single string and append to the type content
  const moduleTypes: string[] = [
    buildModuleType(AUTH_MODULE_TYPE, authTypes),
    buildModuleType(ACCOUNT_MODULE_TYPE, accountTypes),
    buildModuleType(HEALTH_MODULE_TYPE, healthTypes),
    ...Object.entries(resourceTypes).map(([name, types]) =>
      buildModuleType(`${name}${RESOURCE_MODULE_TYPE}`, types)
    )
  ];

  return typeContent + `\n${moduleTypes.join('\n\n')}`;
}

/**
 * Deduplicates exported type and enum names in the provided TypeScript content.
 * Ensures no naming conflicts between types and enums with the same name and resolves duplicate type names.
 *
 * @param {string} content The string content of the TypeScript file to process.
 * @return {string} A modified string with deduplicated names for exported types and enums.
 */
function deduplicateExportedTypes(content: string): string {
  const escapeRegExp = (s: string): string => {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // Collect type names (detect duplicates) and enum names
  const typePattern = /\bexport type (\w+)/g;
  const enumPattern = /\bexport enum (\w+)\s*\{/g;

  const seenTypes = new Set<string>();
  const duplicateTypes = new Set<string>();
  const enumNames = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = typePattern.exec(content)) !== null) {
    const name = m[1];
    if (seenTypes.has(name)) {
      duplicateTypes.add(name);
    } else {
      seenTypes.add(name);
    }
  }
  while ((m = enumPattern.exec(content)) !== null) {
    enumNames.add(m[1]);
  }

  // Handle type-enum collisions
  const typeEnumCollisions = [...seenTypes].filter((n) => enumNames.has(n));
  for (const name of typeEnumCollisions) {
    const escaped = escapeRegExp(name);
    const placeholder = `__DEDUP_${name}__`;

    // Protect enum declaration from the global replacement
    content = content.replace(
      new RegExp(`\\bexport enum ${escaped}\\s*\\{`, 'g'),
      `export enum ${placeholder} {`
    );

    // Rename all type-position occurrences (declaration + references) → NameType
    content = content.replace(
      new RegExp(`\\b${escaped}\\b`, 'g'),
      `${name}Type`
    );

    // Finalize enum name → NameEnum
    content = content.replace(
      new RegExp(`\\bexport enum ${escapeRegExp(placeholder)}\\s*\\{`, 'g'),
      `export enum ${name}Enum {`
    );
  }

  // Handle duplicate type names (rename second occurrence only)
  for (const name of duplicateTypes) {
    if (typeEnumCollisions.includes(name)) {
      // already handled above
      continue;
    }

    const escaped = escapeRegExp(name);

    let firstSeen = false;
    content = content.replace(
      new RegExp(`\\bexport type ${escaped}\\b`, 'g'),
      (match) => {
        if (!firstSeen) {
          firstSeen = true;
          return match;
        }
        return `export type ${name}Type`;
      }
    );
  }

  return content;
}

/**
 * Replaces the `string` and `string[]` types with `File` and `File[]` respectively
 * in TypeScript type definitions related to file uploads, only if the type body
 * includes the annotation `@format binary`.
 *
 * This function processes a TypeScript file content string, identifies type definitions
 * with names matching the pattern `export type <name>FileUpload = {...}`, and updates their
 * definitions to reflect file-like objects instead of plain strings for better type safety.
 *
 * @param {string} typeContent - The TypeScript file content as a string, which
 *     contains the type definitions to be inspected and replaced.
 * @return {string} The updated TypeScript file content, with the modified type
 *     definitions that reflect `File` and `File[]` for annotated file upload types.
 */
function replaceFileUploadTypes(typeContent: string): string {
  const fileUploadPattern = /export type \w+FileUpload = \{/g;
  let result = typeContent;
  let offset = 0;

  let match: RegExpExecArray | null;
  while ((match = fileUploadPattern.exec(typeContent)) !== null) {
    const bodyStart = match.index + match[0].length - 1; // index of opening '{'

    // Extract body using brace-depth counting
    let depth = 0;
    let i = bodyStart;
    for (; i < typeContent.length; i++) {
      if (typeContent[i] === '{') depth++;
      else if (typeContent[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }

    const body = typeContent.slice(bodyStart, i + 1);

    // Guard: only transform if the body contains @format binary
    if (!body.includes('@format binary')) {
      continue;
    }

    // Replace string[] before string to avoid double-replacement
    const newBody = body
      .replace(/\bstring\[]/g, 'File[]')
      .replace(/\bstring\b/g, 'File');

    // Splice the replacement into the result, accounting for prior replacements
    const absoluteStart = match.index + match[0].length - 1 + offset;
    const absoluteEnd = absoluteStart + body.length;
    result =
      result.slice(0, absoluteStart) + newBody + result.slice(absoluteEnd);
    offset += newBody.length - body.length;
  }

  return result;
}

/**
 * Extracts the response type from a provided string of types based on the specified path, method, and status code.
 *
 * @param {string} types - The string containing type definitions.
 * @param {string} path - The full API path to match in the type definitions.
 * @param {string} method - The HTTP method to look for (e.g., get, post, put, delete).
 * @param {string} [code=200] - The HTTP response status code to match.
 * @param {string} [mimeType='application/json'] - The HTTP response mime type to match.
 * @return {string | undefined} The extracted response type if a match is found, otherwise undefined.
 */
function extractResponseType(
  types: string,
  path: string,
  method: string,
  code: string = '200',
  mimeType: string = 'application/json'
): string | undefined {
  const escapedPath = path.replace(/[/[\]{}.*+?^$|()\\]/g, '\\$&');
  const escapedMimeType = mimeType.replace(/[/[\]{}.*+?^$|()\\]/g, '\\$&');

  const regex = new RegExp(
    `"${escapedPath}":\\s*\\{.*?${method}:\\s*\\{.*?"?${code}"?:\\s*\\{.*?"${escapedMimeType}":\\s*(\\w+)`,
    's'
  );

  return types.match(regex)?.[1];
}
