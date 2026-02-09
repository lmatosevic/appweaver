import path from 'node:path';
import { TObject, TSchema, Type } from '@sinclair/typebox';
import {
  AuditFields,
  capitalize,
  FileField,
  IdField,
  InputType,
  Nullable,
  OutputType,
  pickProperties,
  RelationField,
  ResourceModelConfig,
  ResourceModelSchema,
  ScalarField,
  StringDate,
  StringEnum
} from '@appweaver/common';
import { AuditData, Id, IdString } from '../resource';
import { FileDelete, FileUpload } from '../storage';
import { context } from '../context';
import { ResourceNameSymbol } from '../constants';
import { countFieldName } from '../utils';

export function createModel(config: ResourceModelConfig): ResourceModelSchema {
  const name = capitalize(
    config.name || path.basename(path.dirname(__dirname))
  );

  const idSchema = buildIdSchema(config?.id);
  const auditSchema = buildAuditSchema(config?.audit);
  const scalarsSchema = buildScalarsSchema(config?.scalars);
  const virtualSchema = buildScalarsSchema(config?.virtual);
  const filesSchema = buildFilesSchema(config?.files);
  const relationsSchema = buildRelationsSchema(config?.relations);

  const readModel = Type.Composite([idSchema, scalarsSchema, auditSchema], {
    $id: name
  });

  const virtualModel = Type.Composite([virtualSchema], {
    $id: `${name}Virtual`
  });

  const filesModel = Type.Composite([filesSchema], {
    $id: `${name}Files`
  });

  const relationsModel = Type.Composite([relationsSchema], {
    $id: `${name}Relations`
  });

  // Omit or pick create model scalar fields
  let createModel: TObject = scalarsSchema;
  if (config.create?.pick) {
    createModel = Type.Pick(scalarsSchema, config.create.pick);
  } else if (config.create?.omit) {
    createModel = Type.Omit(scalarsSchema, config.create.omit);
  }
  createModel = Type.Composite([createModel], { $id: `${name}Create` });

  // Omit or pick update model scalar fields
  let updateModel: TObject = Type.Partial(scalarsSchema);
  if (config.update?.pick) {
    updateModel = Type.Partial(Type.Pick(scalarsSchema, config.update.pick));
  } else if (config.update?.omit) {
    updateModel = Type.Partial(Type.Omit(scalarsSchema, config.update.omit));
  }
  updateModel = Type.Composite([updateModel], { $id: `${name}Update` });

  const { readOneModel, readManyModel } = buildOutputModels(
    removeHiddenFields(readModel),
    relationsModel,
    filesModel,
    config
  );
  const { createOneModel, updateOneModel } = buildInputModels(
    removeHiddenFields(createModel),
    removeHiddenFields(updateModel),
    relationsModel,
    config
  );
  const { fileUploadModel, fileDeleteModel } = buildFileInputModels(
    config.files
  );

  const resourceModel: ResourceModelSchema = {
    name,
    config,
    readModel,
    readOneModel,
    readManyModel,
    createModel,
    createOneModel,
    updateModel,
    updateOneModel,
    virtualModel,
    filesModel,
    fileUploadModel,
    fileDeleteModel,
    relationsModel
  };

  for (const value of Object.values(resourceModel)) {
    if (typeof value === 'object') {
      value[ResourceNameSymbol] = name;
    }
  }

  resourceModel[ResourceNameSymbol] = name;
  context.models[name] = resourceModel;

  return resourceModel;
}

function removeHiddenFields(schema: TObject): TObject {
  const properties: Record<string, TSchema> = {};

  for (const [name, field] of Object.entries(schema.properties)) {
    if (!field.hidden) {
      properties[name] = field;
    }
  }

  return Type.Object(properties);
}

function buildIdSchema(idField: IdField = { type: 'int' }): TObject {
  let idType: TObject;

  switch (idField.type) {
    case 'text':
      idType = IdString;
      break;
    case 'int':
    case 'bigInt':
    default:
      idType = Id;
  }

  return idType;
}

function buildAuditSchema(
  auditFields: AuditFields = {
    createdAt: true,
    updatedAt: true,
    createdById: true
  }
): TObject {
  const fields: string[] = [];

  for (const [name, included] of Object.entries(auditFields)) {
    if (included) {
      fields.push(name);
    }
  }

  return Type.Pick(AuditData, fields);
}

function buildScalarsSchema(fields: Record<string, ScalarField> = {}): TObject {
  const properties: Record<string, TSchema> = {};

  for (const [name, field] of Object.entries(fields)) {
    properties[name] = buildScalarSchema(field);
  }

  return Type.Object(properties);
}

function buildScalarSchema(field: ScalarField): TSchema {
  let fieldType: TSchema;

  switch (field.type) {
    case 'text':
    case 'blob':
      fieldType = Type.String(
        pickProperties(field, [
          'minLength',
          'maxLength',
          'format',
          'pattern',
          'hidden',
          'examples'
        ])
      );
      break;
    case 'int':
    case 'bigInt':
      fieldType = Type.Integer(
        pickProperties(field, ['minimum', 'maximum', 'hidden', 'examples'])
      );
      break;
    case 'float':
      fieldType = Type.Number(
        pickProperties(field, ['minimum', 'maximum', 'hidden', 'examples'])
      );
      break;
    case 'boolean':
      fieldType = Type.Boolean(pickProperties(field, ['hidden', 'examples']));
      break;
    case 'dateTime':
      fieldType = StringDate(
        pickProperties(field, ['format', 'hidden', 'examples'])
      );
      break;
    case 'json':
      fieldType = Type.Any(pickProperties(field, ['hidden', 'examples']));
      break;
    case 'enum':
      fieldType = StringEnum(
        field.values ?? [],
        pickProperties(field, ['hidden', 'examples'])
      );
      break;
  }

  if (field.array === true) {
    fieldType = Type.Array(fieldType);
  }

  if (field.required === false) {
    fieldType = Nullable(fieldType);
  }

  return fieldType;
}

function buildFilesSchema(files: Record<string, FileField> = {}): TObject {
  const properties: Record<string, TSchema> = {};

  for (const [name, file] of Object.entries(files)) {
    properties[name] = buildFileSchema(file);
  }

  return Type.Object(properties);
}

function buildFileSchema(file: FileField): TSchema {
  const fileSchema = Type.Ref('File');
  return file.array ? Type.Array(fileSchema) : Nullable(fileSchema);
}

function buildRelationsSchema(
  relations: Record<string, RelationField> = {}
): TObject {
  const properties: Record<string, TSchema> = {};

  for (const [name, relation] of Object.entries(relations)) {
    properties[name] = buildRelationSchema(relation);
  }

  return Type.Object(properties);
}

function buildRelationSchema(relation: RelationField): TSchema {
  const modelName = capitalize(relation.model);
  let relationType: TSchema = Type.Ref(modelName);

  relationType = relation.array
    ? Type.Array(relationType, pickProperties(relation, ['minItems']))
    : relationType;

  return relation.required === false
    ? Type.Optional(relationType)
    : relationType;
}

function buildOutputModels(
  readModel: TObject,
  relationsModel: TObject,
  filesModel: TObject,
  modelConfig: ResourceModelConfig
): {
  readOneModel: TObject;
  readManyModel: TObject;
} {
  const relationsConfig = modelConfig.relations;
  const filesConfig = modelConfig.files;

  const readOneModel = Type.Composite([
    readModel,
    relationOutputProperties(relationsModel, relationsConfig, 'single'),
    relationOutputProperties(filesModel, filesConfig, 'single')
  ]);

  const readManyModel = Type.Composite([
    readModel,
    relationOutputProperties(relationsModel, relationsConfig, 'multiple'),
    relationOutputProperties(filesModel, filesConfig, 'multiple')
  ]);

  return { readOneModel, readManyModel };
}

function buildInputModels(
  createModel: TObject,
  updateModel: TObject,
  relationsModel: TObject,
  modelConfig: ResourceModelConfig
): {
  createOneModel: TObject;
  updateOneModel: TObject;
} {
  const relationsConfig = modelConfig.relations;

  if (Object.keys(relationsConfig ?? {}).length === 0) {
    return {
      createOneModel: createModel,
      updateOneModel: updateModel
    };
  }

  let createOneModel: TObject = Type.Object({});
  if (Object.keys(createModel.properties).length > 0) {
    const relationInputs = relationInputProperties(
      relationsModel,
      relationsConfig,
      'create'
    );
    createOneModel = Type.Composite([createModel, relationInputs]);
  }

  let updateOneModel: TObject = Type.Object({});
  if (Object.keys(updateModel.properties).length > 0) {
    const relationInputs = relationInputProperties(
      relationsModel,
      relationsConfig,
      'update'
    );
    updateOneModel = Type.Composite([
      updateModel,
      Type.Partial(relationInputs)
    ]);
  }

  return { createOneModel, updateOneModel };
}

function buildFileInputModels(fileConfig: Record<string, FileField> = {}): {
  fileUploadModel: TObject;
  fileDeleteModel: TObject;
} {
  const fileUploadModel = Type.Object(
    Object.fromEntries(
      Object.entries(fileConfig).map(([key, conf]) => [
        key,
        Type.Optional(conf.array ? Type.Array(FileUpload) : FileUpload)
      ])
    )
  );

  const fileDeleteModel = Type.Object(
    Object.fromEntries(
      Object.entries(fileConfig).map(([key, conf]) => [
        key,
        Type.Optional(conf.array ? Type.Array(FileDelete) : FileDelete)
      ])
    )
  );

  return { fileUploadModel, fileDeleteModel };
}

function relationInputProperties<T extends TObject>(
  object: T,
  relationConfig?: Record<
    string,
    Pick<RelationField, 'required' | 'input' | 'output'>
  >,
  inputType?: InputType
): TObject {
  const relationInputType = (key: string) => {
    const { type, items, ...options } = object.properties[key];

    let inputObjectType: TSchema = Id;
    let uniqueKeyType: TSchema = Id.properties.id;

    const config = relationConfig?.[key];
    if (config) {
      const inputKeys: string[] = [];

      if (
        config.input?.type === 'none' ||
        (inputType === 'create' && config.input?.type === 'update') ||
        (inputType === 'update' && config.input?.type === 'create')
      ) {
        return undefined;
      }

      if (config.input?.uniqueKey) {
        inputKeys.push(config.input.uniqueKey);
        uniqueKeyType = items.properties[config.input.uniqueKey];
      }

      if (config.input?.additionalProps) {
        inputKeys.push(...config.input?.additionalProps.map((p) => p.name));
      }

      if (inputKeys.length > 0) {
        inputObjectType = Type.Object({
          ...inputKeys.reduce((acc, key) => {
            acc[key] = config.input?.additionalProps
              ?.filter((p) => p.required === false)
              .map((p) => p.name)
              ?.includes(key)
              ? Type.Optional(items.properties[key])
              : items.properties[key];
            return acc;
          }, {})
        });
      }
    }

    const isArray = type === 'array';
    const isOptional = config?.required === false;

    const inputTypeSchema = isArray
      ? Type.Array(inputObjectType, options)
      : inputObjectType;
    const uniqueKeySchema = isArray
      ? Type.Array(uniqueKeyType, options)
      : uniqueKeyType;

    const unionSchema = Type.Union([
      isOptional ? Nullable(inputTypeSchema) : inputTypeSchema,
      isOptional ? Nullable(uniqueKeySchema) : uniqueKeySchema
    ]);

    return isOptional ? Type.Optional(unionSchema) : unionSchema;
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

function relationOutputProperties<T extends TObject>(
  object: T,
  relationConfig?: Record<
    string,
    Pick<RelationField, 'required' | 'input' | 'output'>
  >,
  outputType?: OutputType
): TObject {
  const relationOutputType = (key: string) => {
    let schema: TSchema = object.properties[key];

    const config = relationConfig?.[key];
    if (config) {
      if (
        config.output?.type === 'none' ||
        (outputType === 'single' && config.output?.type === 'multiple') ||
        (outputType === 'multiple' && config.output?.type === 'single')
      ) {
        return undefined;
      }

      if (config.required === false && schema.type !== 'array') {
        schema = Nullable(schema);
      }
    }

    return schema;
  };

  const relationCountType = (key: string) => {
    const config = relationConfig?.[key];
    if (!config?.output?.count) {
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
