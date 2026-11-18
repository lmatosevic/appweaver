import { TSchema } from '@sinclair/typebox';

/** The depth of the references a published schema inlines, a deeper one left open. */
const MAX_DEPTH = 4;

/** The keywords of the TypeBox and OpenAPI schemas the agents do not need. */
const SKIPPED = new Set(['$defs', '$id', 'example', 'nullable']);

/**
 * Converts a TypeBox schema into the plain JSON Schema an MCP client receives: the references of the models inlined
 * up to a depth (a deeper one, or a cyclic one, left as any value), without the `$defs`, the `$id` and the examples.
 *
 * @param {TSchema} schema - The schema.
 * @return {Record<string, unknown>} The JSON Schema.
 */
export function toJsonSchema(schema: TSchema): Record<string, unknown> {
  return walk(schema, {}, 0) as Record<string, unknown>;
}

function walk(
  node: unknown,
  defs: Record<string, TSchema>,
  depth: number
): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, defs, depth));
  }
  if (!node || typeof node !== 'object') {
    return node;
  }
  const schema = node as Record<string, any>;
  const scope = schema.$defs ? { ...defs, ...schema.$defs } : defs;
  if (typeof schema.$ref === 'string') {
    const { $ref, ...rest } = schema;
    const target = scope[$ref.replace(/^#\/\$defs\//, '')];
    if (!target || depth >= MAX_DEPTH) {
      return rest.description ? { description: rest.description } : {};
    }
    return walk({ ...target, ...rest }, scope, depth + 1);
  }
  const plain: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!SKIPPED.has(key)) {
      plain[key] = walk(value, scope, depth);
    }
  }
  if (schema.nullable === true && typeof plain.type === 'string') {
    plain.type = [plain.type, 'null'];
  }
  return plain;
}
