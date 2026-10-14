import { SerializerSelector } from '@fastify/fast-json-stringify-compiler';

type Schema = Record<string, unknown>;

type BuildSerializer = ReturnType<typeof SerializerSelector>;

/**
 * Creates a serializer factory passing to each response serializer only the
 * shared schemas its response schema references, directly or through another
 * shared schema. The serializer otherwise validates and indexes every shared
 * schema of the server for each response it compiles, which makes up most of
 * the startup time of a server with many models and routes. A response
 * referencing a schema identified only inside another one gets all of them.
 *
 * @return {BuildSerializer} The serializer factory for the
 * `schemaController.compilersFactory.buildSerializer` server option.
 */
export function referencedSerializer(): BuildSerializer {
  const buildSerializer = SerializerSelector();
  // The schema objects are shared by the encapsulated contexts of a server
  const references = new WeakMap<object, Set<string>>();

  return (externalSchemas, serializerOpts) => {
    const schemas = (externalSchemas ?? {}) as Record<string, Schema>;

    return (route) => {
      const ids = referencedIds(route.schema, schemas, references);
      const referenced = ids
        ? Object.fromEntries([...ids].map((id) => [id, schemas[id]]))
        : schemas;

      return buildSerializer(referenced, serializerOpts)(route);
    };
  };
}

// The ids of the shared schemas the schema references transitively, or
// undefined when a reference names no shared schema
function referencedIds(
  schema: unknown,
  schemas: Record<string, Schema>,
  references: WeakMap<object, Set<string>>
): Set<string> | undefined {
  const ids = new Set<string>();
  const pending = [...directReferences(schema, references)];

  while (pending.length > 0) {
    const id = pending.pop()!;
    if (ids.has(id)) {
      continue;
    }
    if (!Object.hasOwn(schemas, id)) {
      return undefined;
    }
    ids.add(id);
    pending.push(...directReferences(schemas[id], references));
  }

  return ids;
}

// The ids of the schemas the `$ref` keywords inside the schema point to, a
// reference within the same document left out
function directReferences(
  schema: unknown,
  references: WeakMap<object, Set<string>>
): Set<string> {
  if (!schema || typeof schema !== 'object') {
    return new Set();
  }

  let ids = references.get(schema);
  if (!ids) {
    ids = new Set();
    collectReferences(schema, ids);
    references.set(schema, ids);
  }
  return ids;
}

function collectReferences(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferences(item, ids);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [keyword, child] of Object.entries(value)) {
    if (keyword === '$ref' && typeof child === 'string') {
      const id = child.split('#')[0];
      if (id) {
        ids.add(id);
      }
    } else {
      collectReferences(child, ids);
    }
  }
}
