import { TObject, TSchema, Type } from '@sinclair/typebox';
import { relinkResourceModels, resourceModelProps } from '@appweaver/common';
import { context } from '../../context';

/**
 * Resolves the schema references between every model registered in the context,
 * the same way the resource loader does after importing the model files. Model
 * relations and file fields can only be followed once the references are
 * resolved through the TypeBox module system.
 */
export function linkModels(): void {
  const models = Array.from(context.resource.models.values());

  relinkResourceModels(Object.fromEntries(models.map((m) => [m.name, m])));

  const resourceModels: Record<string, TSchema> = {};
  for (const model of models) {
    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      resourceModels[`${model.name}${suffix}`] = unlinkModel(model[property]);
    }
  }

  const module = Type.Module(resourceModels);

  for (const model of models) {
    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      model[property] = module.Import(
        `${model.name}${suffix}`
      ) as unknown as TObject;
    }
  }
}

/**
 * Unwraps an already linked schema back to its own definition, so that models
 * can be linked again after a single model was redefined. Feeding a linked
 * schema straight back into the module system loses its properties.
 */
function unlinkModel(schema: TSchema): TSchema {
  return schema?.['$ref'] && schema?.['$defs']
    ? schema['$defs'][schema['$ref']]
    : schema;
}
