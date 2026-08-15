import { OpenAPI3 } from 'openapi-typescript';
import { SHARED_ENUM_NAMES, SHARED_SCHEMA_SHAPES } from '../constants';

/** A container holding schema nodes, either the properties of an object or the members of a list. */
type SchemaContainer = Record<string, unknown> | unknown[];

/** A schema node, either a definition or one of the nodes declared below it. */
type SchemaNode = Record<string, unknown>;

/** A single inline schema declaration, located by the container and key holding it. */
interface Occurrence {
  container: SchemaContainer;
  key: string | number;
  /** The name of the definition the schema is declared in (i.e. `PostSingle`). */
  owner: string;
  /** The name of the property the schema is declared under (i.e. `status`). */
  property: string;
}

/** Decides whether a node is hoisted, by returning the key of the group it belongs to. */
type Matcher = (node: SchemaNode) => string | undefined;

/** Keys documenting a schema node rather than describing its structure. They are kept on the
 * property the node is hoisted out of, so no property loses its description along the way. */
const ANNOTATION_KEYS = ['description', 'example', 'examples', 'deprecated'];

/**
 * Hoists the schemas an OpenAPI document repeats inline across its definitions into shared
 * definitions of their own, replacing every occurrence with a reference to the hoisted
 * definition.
 *
 * An Appweaver schema declares the same shapes over and over, once per property that accepts
 * them, and each of them would otherwise be spelled out again in the generated types (i.e. the
 * `asc | desc` enum of every sortable field, or the accepted value of every filterable field of
 * every resource). Two kinds of schema are hoisted:
 *
 * - The well known shapes of {@link SHARED_SCHEMA_SHAPES}, matched in the order they are
 *   declared so an outer shape is hoisted before the shapes nested inside it.
 * - The enums the definitions repeat, named after {@link SHARED_ENUM_NAMES} when their values
 *   are well known, and otherwise after the part the declaring definitions have in common
 *   followed by the property name (i.e. `PostCreate` and `PostSingle` declaring `status` give
 *   `PostStatus`). Enums whose name cannot be resolved are left inline.
 *
 * Only the structure of a schema decides whether it is hoisted, and every occurrence keeps the
 * documentation it carries, so no property loses its description or example along the way.
 *
 * A schema declared only once, or whose name is already taken, is left inline as well.
 *
 * The given schema is mutated in place.
 *
 * @param {OpenAPI3} schema The OpenAPI v3 schema to hoist the shared definitions of.
 * @return {string[]} The names of the hoisted definitions, in the order they were created.
 */
export function hoistSharedTypes(schema: OpenAPI3): string[] {
  const definitions = schema.components?.schemas as
    | Record<string, unknown>
    | undefined;
  if (!definitions) {
    return [];
  }

  const takenNames = new Set<string>(Object.keys(definitions));
  for (const definition of Object.values(definitions)) {
    const title = (definition as SchemaNode)?.['title'];
    if (typeof title === 'string') {
      takenNames.add(title);
    }
  }

  const hoistedNames: string[] = [];
  for (const { name, schema: shape } of SHARED_SCHEMA_SHAPES) {
    if (hoistShape(definitions, name, shape, takenNames)) {
      hoistedNames.push(name);
    }
  }

  hoistedNames.push(...hoistEnums(definitions, takenNames));
  return hoistedNames;
}

/**
 * Hoists every occurrence of a well known shape into a definition of the given name. The
 * definition is built from the first occurrence, so it holds the references the shape declares
 * by title as the references of the document.
 *
 * @param {Record<string, unknown>} definitions The definitions of the schema.
 * @param {string} name The name of the definition the shape is hoisted into.
 * @param {unknown} shape The shape to hoist, holding its references as definition titles.
 * @param {Set<string>} takenNames The definition names already in use.
 * @return {boolean} Whether the shape was hoisted.
 */
function hoistShape(
  definitions: Record<string, unknown>,
  name: string,
  shape: unknown,
  takenNames: Set<string>
): boolean {
  const titles = definitionTitles(definitions);
  const signature = schemaSignature(shape, titles);

  const groups = collectOccurrences(definitions, (node) =>
    schemaSignature(structure(node), titles) === signature ? name : undefined
  );

  const occurrences = groups.get(name);
  if (!occurrences || occurrences.length < 2 || takenNames.has(name)) {
    return false;
  }
  takenNames.add(name);

  const { container, key } = occurrences[0];
  definitions[name] = {
    title: name,
    ...structure((container as SchemaNode)[key] as SchemaNode)
  };

  for (const occurrence of occurrences) {
    replaceWithReference(occurrence, name);
  }

  return true;
}

/**
 * Hoists the enums the definitions repeat into shared definitions named after their values.
 *
 * @param {Record<string, unknown>} definitions The definitions of the schema.
 * @param {Set<string>} takenNames The definition names already in use.
 * @return {string[]} The names of the hoisted definitions, in the order they were created.
 */
function hoistEnums(
  definitions: Record<string, unknown>,
  takenNames: Set<string>
): string[] {
  // Enums declared by identical schema content, keyed by that content. The
  // documentation of a node is left out of the key, since every occurrence keeps
  // the documentation of its own when it is replaced by a reference
  const groups = collectOccurrences(definitions, (node) =>
    Array.isArray(node['enum']) ? stableStringify(structure(node)) : undefined
  );

  const hoistedNames: string[] = [];
  for (const [content, occurrences] of groups) {
    if (occurrences.length < 2) {
      continue;
    }

    const name = resolveEnumName(JSON.parse(content), occurrences);
    if (!name || takenNames.has(name)) {
      continue;
    }
    takenNames.add(name);
    hoistedNames.push(name);

    definitions[name] = { title: name, ...JSON.parse(content) };
    for (const occurrence of occurrences) {
      replaceWithReference(occurrence, name);
    }
  }

  return hoistedNames;
}

/**
 * Replaces the schema node of an occurrence with a reference to the given definition, keeping
 * the documentation the node carries.
 *
 * @param {Occurrence} occurrence The occurrence to replace.
 * @param {string} name The name of the definition to reference.
 */
function replaceWithReference(
  { container, key }: Occurrence,
  name: string
): void {
  const node = (container as SchemaNode)[key] as SchemaNode;

  (container as Record<string | number, unknown>)[key] = {
    ...annotations(node),
    $ref: `#/components/schemas/${name}`
  };
}

/**
 * Collects every inline schema the matcher accepts into a map of occurrences, grouped by the
 * key the matcher returns for them. A node the matcher accepts is not descended into, so an
 * outer match wins over the nodes nested inside it.
 *
 * @param {Record<string, unknown>} definitions The definitions of the schema.
 * @param {Matcher} match The matcher deciding which nodes are collected.
 * @return {Map<string, Occurrence[]>} The collected occurrences, grouped by matcher key.
 */
function collectOccurrences(
  definitions: Record<string, unknown>,
  match: Matcher
): Map<string, Occurrence[]> {
  const groups = new Map<string, Occurrence[]>();

  for (const [key, definition] of Object.entries(definitions)) {
    if (definition && typeof definition === 'object') {
      const owner = (definition as SchemaNode)['title'];
      collect(
        definition as SchemaContainer,
        typeof owner === 'string' ? owner : key,
        '',
        match,
        groups
      );
    }
  }

  return groups;
}

/**
 * Collects every inline schema declared below the given schema node into the groups map.
 *
 * @param {SchemaContainer} container The schema node to collect the schemas of.
 * @param {string} owner The name of the definition the node belongs to.
 * @param {string} property The name of the property the node is declared under, if any.
 * @param {Matcher} match The matcher deciding which nodes are collected.
 * @param {Map<string, Occurrence[]>} groups The collected occurrences, grouped by matcher key.
 */
function collect(
  container: SchemaContainer,
  owner: string,
  property: string,
  match: Matcher,
  groups: Map<string, Occurrence[]>
): void {
  const entries: [string | number, unknown][] = Array.isArray(container)
    ? container.map((value, index) => [index, value])
    : Object.entries(container);

  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    // The keys of a `properties` object name the schemas below them, everything
    // else keeps the property name of the node it was reached through
    if (key === 'properties' && !Array.isArray(value)) {
      const properties = value as Record<string, unknown>;
      for (const name of Object.keys(properties)) {
        visit(properties, name, owner, name, match, groups);
      }
      continue;
    }

    visit(container, key, owner, property, match, groups);
  }
}

/**
 * Records the schema held by the container under the given key as an occurrence, or descends
 * into it when the matcher does not accept it.
 *
 * @param {SchemaContainer} container The container holding the schema node.
 * @param {string | number} key The key the schema node is held under.
 * @param {string} owner The name of the definition the node belongs to.
 * @param {string} property The name of the property the node is declared under, if any.
 * @param {Matcher} match The matcher deciding which nodes are collected.
 * @param {Map<string, Occurrence[]>} groups The collected occurrences, grouped by matcher key.
 */
function visit(
  container: SchemaContainer,
  key: string | number,
  owner: string,
  property: string,
  match: Matcher,
  groups: Map<string, Occurrence[]>
): void {
  const node = (container as Record<string | number, unknown>)[
    key
  ] as SchemaNode;

  const group = match(node);
  if (group !== undefined) {
    const occurrences = groups.get(group) ?? [];
    occurrences.push({ container, key, owner, property });
    groups.set(group, occurrences);
    return;
  }

  collect(node, owner, property, match, groups);
}

/**
 * Resolves the name of the definition an enum is hoisted into, preferring the name given to
 * its values by {@link SHARED_ENUM_NAMES} and falling back to the common part of the names of
 * the definitions declaring it, followed by the property name they all declare it under.
 *
 * @param {SchemaNode} node The enum schema to resolve the name of.
 * @param {Occurrence[]} occurrences The places the enum is declared in.
 * @return {string | undefined} The resolved name, or undefined when the enum has no name to
 * be hoisted under.
 */
function resolveEnumName(
  node: SchemaNode,
  occurrences: Occurrence[]
): string | undefined {
  const values = node['enum'] as unknown[];
  const knownName = SHARED_ENUM_NAMES[values.join('|')];
  if (knownName) {
    return knownName;
  }

  const { property } = occurrences[0];
  if (!property || occurrences.some((o) => o.property !== property)) {
    return undefined;
  }

  const prefix = commonNamePrefix(occurrences.map((o) => o.owner));
  if (!prefix) {
    return undefined;
  }

  return prefix + property.charAt(0).toUpperCase() + property.slice(1);
}

/**
 * Resolves the longest prefix the given names share, cut at a word boundary so the result
 * stays a readable name (i.e. `HealthCheckResponse` and `HealthCheckResult` give
 * `HealthCheck` rather than `HealthCheckRes`).
 *
 * @param {string[]} names The names to find the common prefix of.
 * @return {string} The common prefix, empty when the names start with different words.
 */
function commonNamePrefix(names: string[]): string {
  const wordsPerName = names.map(
    (name) => name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+|[A-Z]/g) ?? []
  );

  const words: string[] = [];
  for (let i = 0; i < wordsPerName[0].length; i++) {
    const word = wordsPerName[0][i];
    if (wordsPerName.some((other) => other[i] !== word)) {
      break;
    }
    words.push(word);
  }

  return words.join('');
}

/**
 * Maps every definition key to the title it is generated under, so a reference can be compared
 * by the name it resolves to rather than by the generated key holding it.
 *
 * @param {Record<string, unknown>} definitions The definitions of the schema.
 * @return {Map<string, string>} The title of every definition, keyed by its definition key.
 */
function definitionTitles(
  definitions: Record<string, unknown>
): Map<string, string> {
  const titles = new Map<string, string>();

  for (const [key, definition] of Object.entries(definitions)) {
    const title = (definition as SchemaNode)?.['title'];
    titles.set(key, typeof title === 'string' ? title : key);
  }

  return titles;
}

/**
 * Returns the documentation keys of a schema node, which the node keeps when it is replaced by
 * a reference to a hoisted definition.
 *
 * @param {SchemaNode} node The schema node to take the documentation of.
 * @return {SchemaNode} The documentation keys of the node.
 */
function annotations(node: SchemaNode): SchemaNode {
  return Object.fromEntries(
    Object.entries(node).filter(([key]) => ANNOTATION_KEYS.includes(key))
  );
}

/**
 * Returns the structural keys of a schema node, so two nodes describing the same shape under a
 * different description compare alike.
 *
 * @param {SchemaNode} node The schema node to take the structure of.
 * @return {SchemaNode} The structural keys of the node.
 */
function structure(node: SchemaNode): SchemaNode {
  return Object.fromEntries(
    Object.entries(node).filter(([key]) => !ANNOTATION_KEYS.includes(key))
  );
}

/**
 * Serializes a schema with its references resolved to the title of the definition they point
 * to, so a shape declared by {@link SHARED_SCHEMA_SHAPES} compares equal to the same shape of a
 * document, whose references name the generated definition keys instead.
 *
 * @param {unknown} value The schema to serialize.
 * @param {Map<string, string>} titles The title of every definition, keyed by definition key.
 * @return {string} The stable serialization of the schema.
 */
function schemaSignature(value: unknown, titles: Map<string, string>): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => schemaSignature(item, titles)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.keys(value as SchemaNode)
      .sort()
      .map((key) => {
        const nested = (value as SchemaNode)[key];
        const resolved =
          key === '$ref' && typeof nested === 'string'
            ? JSON.stringify(referenceTitle(nested, titles))
            : schemaSignature(nested, titles);
        return `${JSON.stringify(key)}:${resolved}`;
      });
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

/**
 * Resolves a reference to the title of the definition it points to.
 *
 * @param {string} reference The reference to resolve (i.e. `#/components/schemas/def-1`).
 * @param {Map<string, string>} titles The title of every definition, keyed by definition key.
 * @return {string} The title of the referenced definition, or the reference when it points
 * outside of the definitions of the document.
 */
function referenceTitle(
  reference: string,
  titles: Map<string, string>
): string {
  const key = reference.replace('#/components/schemas/', '');
  return titles.get(key) ?? reference;
}

/**
 * Serializes a value with its object keys sorted, so two schemas holding the same content
 * in a different key order serialize alike.
 *
 * @param {unknown} value The value to serialize.
 * @return {string} The stable JSON serialization of the value.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.keys(value as SchemaNode)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as SchemaNode)[key])}`
      );
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}
