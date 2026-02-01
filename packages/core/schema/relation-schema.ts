import { TObject, TSchema, Type } from '@sinclair/typebox';
import { CommonId } from './common-schema';
import { countFieldName, Nullable } from '../utils';
import {
  FileConfigProps,
  OutputType,
  InputType,
  RelationConfigProps,
  ResourceModelConfig
} from '../types';

export function relationInputProperties<T extends TObject>(
  object: T,
  relationConfig?: RelationConfigProps,
  inputType?: InputType
): TObject {
  const relationInputType = (key: string) => {
    const { type, items, ...options } = object.properties[key];

    let inputObjectType: TSchema = CommonId;
    let uniqueKeyType: TSchema = CommonId.properties.id;

    const config = relationConfig?.[key];
    if (config) {
      const inputKeys: string[] = [];

      if (
        config.inputType === 'none' ||
        (inputType === 'create' && config.inputType === 'update') ||
        (inputType === 'update' && config.inputType === 'create')
      ) {
        return undefined;
      }

      if (config.inputUniqueKey) {
        inputKeys.push(config.inputUniqueKey as string);
        uniqueKeyType = items.properties[config.inputUniqueKey];
      }

      if (config.inputAdditionalProps) {
        inputKeys.push(...(config.inputAdditionalProps as string[]));
      }

      if (inputKeys.length > 0) {
        inputObjectType = Type.Object({
          ...inputKeys.reduce((acc, key) => {
            acc[key] = config.inputOptionalProps?.includes(key as any)
              ? Type.Optional(items.properties[key])
              : items.properties[key];
            return acc;
          }, {})
        });
      }
    }

    const isArray = type === 'array';

    const inputTypeSchema = isArray
      ? Type.Array(inputObjectType, options)
      : inputObjectType;
    const uniqueKeySchema = isArray
      ? Type.Array(uniqueKeyType, options)
      : uniqueKeyType;

    const unionSchema = Type.Union([
      config?.optional ? Nullable(inputTypeSchema) : inputTypeSchema,
      config?.optional ? Nullable(uniqueKeySchema) : uniqueKeySchema
    ]);

    return config?.optional ? Type.Optional(unionSchema) : unionSchema;
  };

  return Type.Object({
    ...Object.keys(object.properties).reduce((acc, key) => {
      const type = relationInputType(key);
      if (type) {
        acc[key] = type;
      }
      return acc;
    }, {})
  });
}

export function relationOutputProperties<T extends TObject>(
  object: T,
  relationConfig?: RelationConfigProps | FileConfigProps,
  outputType?: OutputType
): TObject {
  const relationOutputType = (key: string) => {
    let schema: TSchema = object.properties[key];

    const config = relationConfig?.[key];
    if (config) {
      if (
        config.outputType === 'none' ||
        (outputType === 'single' && config.outputType === 'multiple') ||
        (outputType === 'multiple' && config.outputType === 'single')
      ) {
        return undefined;
      }

      if (config.optional && schema.type !== 'array') {
        schema = Nullable(schema);
      }
    }

    return schema;
  };

  const relationCountType = (key: string) => {
    const config = relationConfig?.[key];
    if (!config?.outputCount) {
      return undefined;
    }

    return Type.Integer({ minimum: 0 });
  };

  return Type.Object({
    ...Object.keys(object.properties).reduce((acc, key) => {
      const type = relationOutputType(key);
      if (type) {
        acc[key] = type;
      }

      const countType = relationCountType(key);
      if (countType) {
        acc[countFieldName(key)] = countType;
      }

      return acc;
    }, {})
  });
}

export function relationOutputModels(modelConfig: ResourceModelConfig): {
  readOneModel?: TObject;
  readManyModel?: TObject;
} {
  const { relationModel, fileModel, readModel, fileConfig, relationConfig } =
    modelConfig;

  const readModelType = readModel ?? Type.Object({});
  const fileModelType = fileModel ?? Type.Object({});
  const relationModelType = relationModel ?? Type.Object({});

  const readOneModel = Type.Composite([
    readModelType,
    relationOutputProperties(relationModelType, relationConfig, 'single'),
    relationOutputProperties(fileModelType, fileConfig, 'single')
  ]);

  const readManyModel = Type.Composite([
    readModelType,
    relationOutputProperties(relationModelType, relationConfig, 'multiple'),
    relationOutputProperties(fileModelType, fileConfig, 'multiple')
  ]);

  return { readOneModel, readManyModel };
}

export function relationInputModels(modelConfig: ResourceModelConfig): {
  createOneModel?: TObject;
  updateOneModel?: TObject;
} {
  const { relationModel, relationConfig } = modelConfig;
  if (!relationModel) {
    return {
      createOneModel: modelConfig.createModel,
      updateOneModel: modelConfig.updateModel
    };
  }

  let createOneModel: TObject | undefined;
  if (modelConfig.createModel) {
    const relationInputs = relationInputProperties(
      relationModel,
      relationConfig,
      'create'
    );
    createOneModel = Type.Composite([modelConfig.createModel, relationInputs]);
  }

  let updateOneModel: TObject | undefined;
  if (modelConfig.updateModel) {
    const relationInputs = relationInputProperties(
      relationModel,
      relationConfig,
      'update'
    );
    updateOneModel = Type.Composite([
      modelConfig.updateModel,
      Type.Partial(relationInputs)
    ]);
  }

  return { createOneModel, updateOneModel };
}
