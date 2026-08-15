/**
 * Rewrites the TypeScript enums of the generated types into a constant object holding the
 * members and a type alias of their values, so both forms are accepted wherever the enum is
 * used (i.e. `SortDirection.asc` and the plain `'asc'` literal alike).
 *
 * A TypeScript `enum` declares a nominal type, which rejects the very literals it is built
 * from, forcing users of the generated client to import the enum for a value the API
 * documents as a string. The rewritten declaration keeps the member access working while
 * typing the property as the union of its values:
 *
 * ```ts
 * export const SortDirection = { asc: 'asc', desc: 'desc' } as const;
 * export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];
 * ```
 *
 * @param {string} content The generated TypeScript types to rewrite the enums of.
 * @param {boolean} [declaration=false] Whether the types are emitted into a declaration
 * (`.d.ts`) file, which holds no runtime values and so declares the constant instead of
 * initializing it.
 * @return {string} The types with every enum declaration rewritten.
 */
export function rewriteEnumsAsObjects(
  content: string,
  declaration: boolean = false
): string {
  return content.replace(
    /export enum (\w+) \{([^}]*)}/g,
    (match, name: string, body: string) => {
      const members = parseEnumMembers(body);
      if (members.length === 0) {
        return match;
      }

      const values = members
        .map(([member, value]) =>
          declaration
            ? `    readonly ${member}: ${value};`
            : `    ${member}: ${value},`
        )
        .join('\n');

      const constant = declaration
        ? `export declare const ${name}: {\n${values}\n};`
        : `export const ${name} = {\n${values}\n} as const;`;

      return `${constant}\nexport type ${name} = (typeof ${name})[keyof typeof ${name}];`;
    }
  );
}

/**
 * Parses the members of an enum declaration body into their name and value pairs, keeping
 * the value verbatim so a quoted member name or a numeric value survives the rewrite.
 *
 * @param {string} body The body of the enum declaration, without the enclosing braces.
 * @return {[string, string][]} The name and value of every member, in declaration order.
 */
function parseEnumMembers(body: string): [string, string][] {
  const members: [string, string][] = [];

  // A member name, quoted or not, followed by its value, which is a quoted string
  // (holding a comma of its own or not) or a number
  const pattern =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[\w$]+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?[\d.]+)/g;

  let member: RegExpExecArray | null;
  while ((member = pattern.exec(body)) !== null) {
    members.push([member[1], member[2]]);
  }

  return members;
}
