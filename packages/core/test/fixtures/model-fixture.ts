import { TObject, TSchema, Type } from '@sinclair/typebox';
import { resourceModelProps } from '@appweaver/common';
import { context } from '../../context';

/**
 * Resolves the schema references between every model registered in the context,
 * the same way the resource loader does after importing the model files. Model
 * relations and file fields can only be followed once the references are
 * resolved through the TypeBox module system.
 */
export function linkModels(): void {
  const models = Array.from(context.resource.models.values());

  const resourceModels: Record<string, TSchema> = {};
  for (const model of models) {
    for (const [suffix, property] of Object.entries(resourceModelProps)) {
      resourceModels[`${model.name}${suffix}`] = model[property];
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
