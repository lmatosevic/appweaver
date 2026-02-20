import path from 'node:path';
import { Kind, TObject, TSchema, Type } from '@sinclair/typebox';
import {
  AnyJson,
  AuditData,
  AuditFields,
  capitalize,
  FileField,
  Id,
  IdField,
  IdString,
  InputType,
  isObject,
  Nullable,
  OperationConfig,
  OutputType,
  pickProperties,
  RelationField,
  ResourceModelConfig,
  ResourceModelSchema,
  ScalarField,
  StringDate,
  StringEnum,
  VirtualConfig
} from '@appweaver/common';
import { context } from '../context';
import {
  ResourceNameSymbol,
  ResourceTypeModel,
  ResourceTypeSymbol
} from '../constants';
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
    Type.Composite([scalarsSchema, virtualSchema]),
    config.create
  );

  const updateModel = omitOrPickScalars(
    Type.Composite([scalarsSchema, virtualSchema]),
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

  const resourceModel: ResourceModelSchema = {
    name,
    config,
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
      value[ResourceNameSymbol] = name;
    }
  }

  resourceModel[ResourceNameSymbol] = name;
  resourceModel[ResourceTypeSymbol] = ResourceTypeModel;

  context.models[name] = resourceModel;

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

  let createOneModel: TObject = Type.Object(
    {},
    { $id: `${config.name}Create` }
  );
  if (Object.keys(adjustedCreateModel.properties).length > 0) {
    const relationInputs = relationInputProperties(
      relationsModel,
      relationsConfig,
      'create'
    );
    createOneModel = Type.Composite([adjustedCreateModel, relationInputs], {
      $id: `${config.name}Create`
    });
  }

  let updateOneModel: TObject = Type.Object(
    {},
    { $id: `${config.name}Update` }
  );
  if (Object.keys(adjustedUpdateModel.properties).length > 0) {
    const relationInputs = relationInputProperties(
      relationsModel,
      relationsConfig,
      'update'
    );
    updateOneModel = Type.Composite(
      [adjustedUpdateModel, Type.Partial(relationInputs)],
      { $id: `${config.name}Update` }
    );
  }

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
    if (
      virtual.input?.type === 'none' ||
      (inputType === 'create' && virtual.input?.type === 'update') ||
      (inputType === 'update' && virtual.input?.type === 'create')
    ) {
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
    if (
      virtual.output?.type === 'none' ||
      (outputType === 'single' && virtual.output?.type === 'multiple') ||
      (outputType === 'multiple' && virtual.output?.type === 'single')
    ) {
      excludeFields.push(name);
    }
  }

  return Type.Omit(schema, excludeFields);
}
