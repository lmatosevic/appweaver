import { OpenAPI3 } from 'openapi-typescript';
import { SHARED_ENUM_NAMES } from '../constants';

/** A container holding schema nodes, either the properties of an object or the members of a list. */
type SchemaContainer = Record<string, unknown> | unknown[];

/** A single inline enum declaration, located by the container and key holding it. */
interface EnumOccurrence {
  container: SchemaContainer;
  key: string | number;
  /** The name of the definition the enum is declared in (i.e. `PostSingle`). */
  owner: string;
  /** The name of the property the enum is declared under (i.e. `status`). */
  property: string;
}

/**
 * Hoists the inline enums a schema repeats across its definitions into shared definitions
 * of their own, replacing every occurrence with a reference to the hoisted definition.
 *
 * An Appweaver schema declares the same enum inline over and over, once per property that
 * accepts it, and each of them would otherwise become an enum of its own in the generated
 * types (i.e. a separate `asc | desc` enum for every sortable field of every resource).
 *
 * Only enums that are byte for byte identical are hoisted, so no property loses its
 * description, example or nullability along the way. The hoisted definition is named after
 * {@link SHARED_ENUM_NAMES} when its values are well known, and otherwise after the part
 * the declaring definitions have in common followed by the property name (i.e. `PostCreate`
 * and `PostSingle` declaring `status` give `PostStatus`). Enums whose name cannot be
 * resolved, or whose name is already taken, are left inline.
 *
 * The given schema is mutated in place.
 *
 * @param {OpenAPI3} schema The OpenAPI v3 schema to hoist the shared enums of.
 * @return {string[]} The names of the hoisted definitions, in the order they were created.
 */
export function hoistSharedEnums(schema: OpenAPI3): string[] {
  const definitions = schema.components?.schemas as
    | Record<string, unknown>
    | undefined;
  if (!definitions) {
    return [];
  }

  // Enums declared by identical schema content, keyed by that content
  const groups = new Map<string, EnumOccurrence[]>();
  for (const [key, definition] of Object.entries(definitions)) {
    if (definition && typeof definition === 'object') {
      const owner = (definition as Record<string, unknown>)['title'];
      collectEnums(
        definition as SchemaContainer,
        typeof owner === 'string' ? owner : key,
        '',
        groups
      );
    }
  }

  const takenNames = new Set<string>(Object.keys(definitions));
  for (const definition of Object.values(definitions)) {
    const title = (definition as Record<string, unknown>)?.['title'];
    if (typeof title === 'string') {
      takenNames.add(title);
    }
  }

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
    for (const { container, key } of occurrences) {
      (container as Record<string | number, unknown>)[key] = {
        $ref: `#/components/schemas/${name}`
      };
    }
  }

  return hoistedNames;
}

/**
 * Collects every inline enum declared below the given schema node into the groups map,
 * keyed by the stable serialization of the enum schema, so identical enums group together.
 *
 * @param {SchemaContainer} container The schema node to collect the enums of.
 * @param {string} owner The name of the definition the node belongs to.
 * @param {string} property The name of the property the node is declared under, if any.
 * @param {Map<string, EnumOccurrence[]>} groups The collected occurrences, grouped by content.
 */
function collectEnums(
  container: SchemaContainer,
  owner: string,
  property: string,
  groups: Map<string, EnumOccurrence[]>
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
        visitSchema(properties, name, owner, name, groups);
      }
      continue;
    }

    visitSchema(container, key, owner, property, groups);
  }
}

/**
 * Records the schema held by the container under the given key as an enum occurrence, or
 * descends into it when it declares no enum of its own.
 *
 * @param {SchemaContainer} container The container holding the schema node.
 * @param {string | number} key The key the schema node is held under.
 * @param {string} owner The name of the definition the node belongs to.
 * @param {string} property The name of the property the node is declared under, if any.
 * @param {Map<string, EnumOccurrence[]>} groups The collected occurrences, grouped by content.
 */
function visitSchema(
  container: SchemaContainer,
  key: string | number,
  owner: string,
  property: string,
  groups: Map<string, EnumOccurrence[]>
): void {
  const node = (container as Record<string | number, unknown>)[key] as Record<
    string,
    unknown
  >;

  if (Array.isArray(node['enum'])) {
    const content = stableStringify(node);
    const occurrences = groups.get(content) ?? [];
    occurrences.push({ container, key, owner, property });
    groups.set(content, occurrences);
    return;
  }

  collectEnums(node, owner, property, groups);
}

/**
 * Resolves the name of the definition an enum is hoisted into, preferring the name given to
 * its values by {@link SHARED_ENUM_NAMES} and falling back to the common part of the names of
 * the definitions declaring it, followed by the property name they all declare it under.
 *
 * @param {Record<string, unknown>} node The enum schema to resolve the name of.
 * @param {EnumOccurrence[]} occurrences The places the enum is declared in.
 * @return {string | undefined} The resolved name, or undefined when the enum has no name to
 * be hoisted under.
 */
function resolveEnumName(
  node: Record<string, unknown>,
  occurrences: EnumOccurrence[]
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
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
      );
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}
