import { TObject, TSchema, Type } from '@sinclair/typebox';
import { MODEL } from '@appweaver/common';
import { context, define } from '../context';

/**
 * Creates a schema model by defining it with the given name and schema object. This function returns a TypeBox
 * reference to the created schema model.
 *
 * @param {TObject} schema - The schema object defining the structure of the model.
 * @param {Object} config - Configuration options for schema model creation.
 * @param {string} [config.name] - The name of the schema model to be referenced by. If not provided, then
 * `schema.$id` or `schema.title` will be used by default. If both are `undefined`, then a generic name will be used.
 * @param {boolean} [config.addToServer] - Whether to add the schema to the server instance. Defaults to `true`.
 * @param {boolean} [config.skipExisting] - Whether to skip creating a schema model if it is alredy created with the
 * same name. Defaults to `true`.
 * @return {TObject} A reference to the created schema model, but returned type will be the model it references, so
 * this function can be used while building schema properties and provide type support in routes.
 */
export function createSchemaModel<T extends TObject>(
  schema: T,
  config: { name?: string; addToServer?: boolean; skipExisting?: boolean } = {}
): T {
  const existingModels = context.definitions.filter((d) => d.name === MODEL);

  const name =
    config.name ??
    schema.$id ??
    schema.title ??
    `Object${existingModels.length}`;

  const reference = Type.Ref(name) as unknown as T;

  if (
    existingModels.find((m) => m.name === name) &&
    config.skipExisting !== false
  ) {
    return reference;
  }

  define({ name, schema }, MODEL, 'append');

  if (context.server && config.addToServer !== false) {
    context.server.addSchema({ ...schema, $id: name });
  }

  return reference;
}

/**
 * Converts the given schema model into a schema reference if it is not already a reference.
 * If the model schema has a `$ref` property, it is returned as is.
 * Otherwise, it creates a reference using the `$id` of the model schema.
 *
 * @param {TSchema} modelSchema - The schema model to process. It must extend the `TSchema` type.
 * @return {TSchema} The processed schema model, either as the original reference or converted into one.
 */
export function toSchemaReference<T extends TSchema>(modelSchema: T): T {
  return modelSchema.$ref
    ? modelSchema
    : (Type.Ref(modelSchema.$id!) as unknown as T);
}
