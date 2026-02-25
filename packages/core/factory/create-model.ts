import path from 'node:path';
import { Kind, TObject, TSchema, Type } from '@sinclair/typebox';
import {
  AnyJson,
  AuditFields,
  capitalize,
  FileField,
  IdField,
  InputType,
  isObject,
  Nullable,
  OperationConfig,
  OutputType,
  pickProperties,
  RelationField,
  ResourceModelConfig,
  ScalarField,
  StringDate,
  StringEnum,
  VirtualConfig
} from '@appweaver/common';
import { define } from '../context';
import { AuditData, Id, IdString } from '../resource';
import { countFieldName } from '../utils';
import { ResourceModel } from '../types';
import {
  RESOURCE_MODEL_TYPE,
  RESOURCE_NAME,
  RESOURCE_TYPE
} from '../constants';

export function createModel(config: ResourceModelConfig): ResourceModel {
  const name = capitalize(
    config.name || path.basename(path.dirname(__dirname))
  );

  const idSchema = buildIdSchema(config?.id);
  const auditSchema = buildAuditSchema(config?.audit);
  const scalarsSchema = buildScalarsSchema(config?.scalars);
  const virtualSchema = buildScalarsSchema(config?.virtual);
  const filesSchema = buildFilesSchema(config?.files);
  const relationsSchema = buildRelationsSchema(config?.relations);

  const readModel = Type.Composite(
    [
      idSchema,
      scalarsSchema,
      virtualSchema,
      relationsSchema,
      filesSchema,
      auditSchema
    ],
    {
      $id: name
    }
  );

  const virtualModel = Type.Composite([virtualSchema], {
    $id: `${name}Virtual`
  });
  const relationsModel = Type.Composite([relationsSchema], {
    $id: `${name}Relations`
  });
  const filesModel = Type.Composite([filesSchema], { $id: `${name}Files` });

  const baseReadModel = omitOrPickScalars(
    Type.Composite([idSchema, scalarsSchema, virtualSchema, auditSchema]),
    config.read
  );

  const createModel = omitOrPickScalars(
    resolveDefaultScalars(
      Type.Composite([scalarsSchema, virtualSchema]),
      config
    ),
    config.create
  );

  const updateModel = omitOrPickScalars(
    resolveDefaultScalars(
      Type.Partial(Type.Composite([scalarsSchema, virtualSchema])),
      config
    ),
    config.update
  );

  const { readOneModel, readManyModel } = buildOutputModels(
    baseReadModel,
    relationsModel,
    filesModel,
    config
  );
  const { createOneModel, updateOneModel } = buildInputModels(
    createModel,
    updateModel,
    relationsModel,
    config
  );
  const { fileUploadModel, fileDeleteModel } = buildFileInputModels(config);

  const resourceModel: ResourceModel = {
    name,
    config: config,
    readModel,
    createModel,
    updateModel,
    relationsModel,
    filesModel,
    virtualModel,
    readOneModel,
    readManyModel,
    createOneModel,
    updateOneModel,
    fileUploadModel,
    fileDeleteModel
  };

  for (const value of Object.values(resourceModel)) {
    if (isObject(value)) {
      value[RESOURCE_NAME] = name;
    }
  }

  resourceModel[RESOURCE_NAME] = name;
  resourceModel[RESOURCE_TYPE] = RESOURCE_MODEL_TYPE;

  define(resourceModel);

  return resourceModel;
}

function buildIdSchema(idField: IdField = { type: 'int' }): TObject {
  let idType: TObject;

  switch (idField.type) {
    case 'string':
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
    case 'string':
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
      fieldType = AnyJson(pickProperties(field, ['hidden', 'examples']));
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

function omitOrPickScalars(
  type: TObject,
  operationConfig?: OperationConfig
): TObject {
  let restrictedType: TObject = type;

  if (operationConfig?.pick) {
    restrictedType = Type.Pick(type, operationConfig.pick);
  } else if (operationConfig?.omit) {
    restrictedType = Type.Omit(type, operationConfig.omit);
  }

  return Type.Composite([restrictedType]);
}

function resolveDefaultScalars(
  type: TObject,
  config: ResourceModelConfig
): TObject {
  for (const name of Object.keys(type.properties)) {
    const field = type.properties[name];
    if (
      config?.scalars?.[name]?.default !== undefined ||
      config?.virtual?.[name]?.default !== undefined
    ) {
      type.properties[name] = Type.Optional(field);
    }
  }
  return type;
}

function buildFilesSchema(files: Record<string, FileField> = {}): TObject {
  const properties: Record<string, TSchema> = {};

  for (const [name, file] of Object.entries(files)) {
    properties[name] = buildFileSchema(file);
  }

  return Type.Object(properties);
}

function buildFileSchema(file: FileField): TSchema {
  const fileSchema = Type.Ref('FileSingle');
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
  const modelRefName = `${modelName}Single`;
  let relationType: TSchema = Type.Ref(modelRefName);

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
  config: ResourceModelConfig
): {
  readOneModel: TObject;
  readManyModel: TObject;
} {
  const virtualConfig = config.virtual;
  const relationsConfig = config.relations;
  const filesConfig = config.files;

  const adjustedReadModel = removeHiddenFields(readModel);

  const readOneModel = Type.Composite(
    [
      resolveOutputVirtualFields(adjustedReadModel, virtualConfig, 'single'),
      relationOutputProperties(relationsModel, relationsConfig, 'single'),
      relationOutputProperties(filesModel, filesConfig, 'single')
    ],
    { $id: `${config.name}Single` }
  );

  const readManyModel = Type.Composite(
    [
      resolveOutputVirtualFields(adjustedReadModel, virtualConfig, 'multiple'),
      relationOutputProperties(relationsModel, relationsConfig, 'multiple'),
      relationOutputProperties(filesModel, filesConfig, 'multiple')
    ],
    { $id: `${config.name}Multiple` }
  );

  return { readOneModel, readManyModel };
}

function buildInputModels(
  createModel: TObject,
  updateModel: TObject,
  relationsModel: TObject,
  config: ResourceModelConfig
): {
  createOneModel: TObject;
  updateOneModel: TObject;
} {
  const virtualConfig = config.virtual;
  const relationsConfig = config.relations;

  const adjustedCreateModel = resolveInputVirtualFields(
    removeHiddenFields(createModel),
    virtualConfig,
    'create'
  );
  const adjustedUpdateModel = resolveInputVirtualFields(
    removeHiddenFields(updateModel),
    virtualConfig,
    'update'
  );

  if (Object.keys(relationsConfig ?? {}).length === 0) {
    return {
      createOneModel: adjustedCreateModel,
      updateOneModel: adjustedUpdateModel
    };
  }

  const relationCreateInputs = relationInputProperties(
    relationsModel,
    relationsConfig,
    'create'
  );
  const createOneModel = Type.Composite(
    [adjustedCreateModel, relationCreateInputs],
    {
      $id: `${config.name}Create`
    }
  );

  const relationUpdateInputs = relationInputProperties(
    relationsModel,
    relationsConfig,
    'update'
  );
  const updateOneModel = Type.Composite(
    [adjustedUpdateModel, Type.Partial(relationUpdateInputs)],
    { $id: `${config.name}Update` }
  );

  return { createOneModel, updateOneModel };
}

function buildFileInputModels(config: ResourceModelConfig): {
  fileUploadModel: TObject;
  fileDeleteModel: TObject;
} {
  const fileConfig = config.files ?? {};
  const FileUpload = Type.Unsafe({
    type: 'string',
    format: 'binary',
    [Kind]: 'String'
  });
  const FileDelete = Type.String({ examples: ['image_123.png'] });

  const fileUploadModel = Type.Object(
    Object.fromEntries(
      Object.entries(fileConfig).map(([key, conf]) => [
        key,
        Type.Optional(conf.array ? Type.Array(FileUpload) : FileUpload)
      ])
    ),
    { $id: `${config.name}FileUpload` }
  );

  const fileDeleteModel = Type.Object(
    Object.fromEntries(
      Object.entries(fileConfig).map(([key, conf]) => [
        key,
        Type.Optional(conf.array ? Type.Array(FileDelete) : FileDelete)
      ])
    ),
    { $id: `${config.name}FileDelete` }
  );

  return { fileUploadModel, fileDeleteModel };
}

function relationInputProperties<T extends TObject>(
  object: T,
  relationConfig?: Record<string, RelationField>,
  inputType?: InputType
): TObject {
  const relationInputType = (key: string) => {
    const { type, ...options } = object.properties[key];

    const uniqueIdObject = Id;
    const uniqueIdType = Id.properties.id;

    let fullInputType: TSchema | undefined = undefined;

    const config = relationConfig?.[key];
    if (config) {
      if (shouldSkipInputField(config.input?.type, inputType)) {
        return undefined;
      }

      if (config.input?.fullModel) {
        fullInputType = Type.Ref(`${config.model}Create`);
      }
    }

    const isArray = type === 'array';
    const isOptional = config?.required === false;

    const idObjectSchema = isArray
      ? Type.Array(uniqueIdObject, options)
      : uniqueIdObject;
    const idTypeSchema = isArray
      ? Type.Array(uniqueIdType, options)
      : uniqueIdType;

    const inputTypeSchemas: TSchema[] = [
      isOptional ? Nullable(idObjectSchema) : idObjectSchema,
      isOptional ? Nullable(idTypeSchema) : idTypeSchema
    ];

    if (fullInputType) {
      const fullInputTypeSchema = isArray
        ? Type.Array(fullInputType, options)
        : fullInputType;
      inputTypeSchemas.push(
        isOptional ? Nullable(fullInputTypeSchema) : fullInputTypeSchema
      );
    }

    const unionSchema = Type.Union(inputTypeSchemas);

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
      if (shouldSkipOutputField(config.output?.type, outputType)) {
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

function removeHiddenFields(schema: TObject): TObject {
  const properties: Record<string, TSchema> = {};

  for (const [name, field] of Object.entries(schema.properties)) {
    if (!field.hidden) {
      properties[name] = field;
    }
  }

  return Type.Object(properties);
}

function resolveInputVirtualFields(
  schema: TObject,
  virtualConfig?: VirtualConfig,
  inputType?: InputType
): TObject {
  const excludeFields: string[] = [];

  for (const [name, virtual] of Object.entries(virtualConfig ?? {})) {
    if (shouldSkipInputField(virtual.input?.type, inputType)) {
      excludeFields.push(name);
    }
  }

  return Type.Omit(schema, excludeFields);
}

function resolveOutputVirtualFields(
  schema: TObject,
  virtualConfig?: VirtualConfig,
  outputType?: OutputType
): TObject {
  const excludeFields: string[] = [];

  for (const [name, virtual] of Object.entries(virtualConfig ?? {})) {
    if (shouldSkipOutputField(virtual.output?.type, outputType)) {
      excludeFields.push(name);
    }
  }

  return Type.Omit(schema, excludeFields);
}

function shouldSkipInputField(
  fieldInputType?: InputType,
  methodInputType?: InputType
): boolean {
  return (
    fieldInputType === 'none' ||
    (methodInputType === 'create' && fieldInputType === 'update') ||
    (methodInputType === 'update' && fieldInputType === 'create')
  );
}

function shouldSkipOutputField(
  fieldOutputType?: OutputType,
  methodOutputType?: OutputType
): boolean {
  return (
    fieldOutputType === 'none' ||
    (methodOutputType === 'single' && fieldOutputType === 'multiple') ||
    (methodOutputType === 'multiple' && fieldOutputType === 'single')
  );
}
