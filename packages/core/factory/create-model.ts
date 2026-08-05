import path from 'node:path';
import { Kind, TObject, TSchema, Type } from '@sinclair/typebox';
import {
  AnyJson,
  AuditFields,
  capitalize,
  countFieldName,
  FileField,
  IdField,
  InputType,
  isPlainObject,
  isRelationArray,
  logger,
  Nullable,
  OperationConfig,
  OutputType,
  pickProperties,
  RelationField,
  RESOURCE_MODEL_TYPE,
  RESOURCE_NAME,
  RESOURCE_TYPE,
  ResourceModel,
  ResourceModelConfig,
  ScalarField,
  StringDate,
  StringEnum,
  VirtualConfig
} from '@appweaver/common';
import { define } from '../context';
import { AuditData, Id, IdString } from '../resource';

export function createModel(
  config: ResourceModelConfig,
  override: boolean = false
): ResourceModel {
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
  const {
    createOneModel,
    updateOneModel,
    relationCreateModel,
    relationUpdateModel,
    relationInputModel
  } = buildInputModels(
    createModel,
    updateModel,
    relationsModel,
    idSchema,
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
    relationCreateModel,
    relationUpdateModel,
    relationInputModel,
    fileUploadModel,
    fileDeleteModel
  };

  for (const value of Object.values(resourceModel)) {
    if (isPlainObject(value)) {
      value[RESOURCE_NAME] = name;
    }
  }

  resourceModel[RESOURCE_NAME] = name;
  resourceModel[RESOURCE_TYPE] = RESOURCE_MODEL_TYPE;

  logger.debug({ modelName: name }, 'Created resource model');

  define(resourceModel, undefined, override ? 'override' : undefined);

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

function buildAuditSchema(audit: AuditFields = {}): TObject {
  const defaultAudit: AuditFields = {
    updatedAt: true,
    createdAt: true,
    createdById: true
  };
  const mergedAudit = { ...defaultAudit, ...audit };

  const fields: string[] = [];

  for (const [name, included] of Object.entries(mergedAudit)) {
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
          'example'
        ])
      );
      break;
    case 'int':
    case 'bigInt':
      fieldType = Type.Integer(
        pickProperties(field, ['minimum', 'maximum', 'hidden', 'example'])
      );
      break;
    case 'float':
      fieldType = Type.Number(
        pickProperties(field, ['minimum', 'maximum', 'hidden', 'example'])
      );
      break;
    case 'boolean':
      fieldType = Type.Boolean(pickProperties(field, ['hidden', 'example']));
      break;
    case 'dateTime':
      fieldType = StringDate(
        pickProperties(field, ['format', 'hidden', 'example'])
      );
      break;
    case 'json':
      fieldType = AnyJson(pickProperties(field, ['hidden', 'example']));
      break;
    case 'enum':
      fieldType = StringEnum(
        field.values ?? [],
        pickProperties(field, ['hidden', 'example'])
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

  relationType = isRelationArray(relation)
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
  idSchema: TObject,
  config: ResourceModelConfig
): {
  createOneModel: TObject;
  updateOneModel: TObject;
  relationCreateModel: TObject;
  relationUpdateModel: TObject;
  relationInputModel: TObject;
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

  // Data models accepted when this model is written inline through another
  // model's relation input. Relations and files are excluded, so nested
  // writes stay limited to the model's own columns, enforced by the service.
  const relationCreateModel = Type.Composite([adjustedCreateModel], {
    $id: `${config.name}RelationCreate`
  });
  const relationUpdateModel = Type.Composite([idSchema, adjustedUpdateModel], {
    $id: `${config.name}RelationUpdate`
  });

  // Wire model for nested relation writes, holding the id together with the
  // fields of both shapes above. It stays permissive because the server
  // strips properties the matched schema does not declare, so a union of the
  // narrower shapes would drop the fields of the ones it rejects.
  const relationInputModel = Type.Object(
    {
      id: Type.Optional(idSchema.properties.id),
      ...optionalProperties(adjustedCreateModel),
      ...optionalProperties(adjustedUpdateModel)
    },
    { $id: `${config.name}RelationInput` }
  );

  if (Object.keys(relationsConfig ?? {}).length === 0) {
    return {
      createOneModel: adjustedCreateModel,
      updateOneModel: adjustedUpdateModel,
      relationCreateModel,
      relationUpdateModel,
      relationInputModel
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

  return {
    createOneModel,
    updateOneModel,
    relationCreateModel,
    relationUpdateModel,
    relationInputModel
  };
}

function optionalProperties(schema: TObject): Record<string, TSchema> {
  const properties: Record<string, TSchema> = {};

  for (const [name, field] of Object.entries(schema.properties)) {
    properties[name] = Type.Optional(field);
  }

  return properties;
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
  const FileDelete = Type.String({ example: 'image_123.png' });

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

    const config = relationConfig?.[key];
    if (config && shouldSkipInputField(config.input?.type, inputType)) {
      return undefined;
    }

    // Inline updates carry the related record id, so only parent update
    // requests accept them
    const acceptsInlineWrite =
      config?.input?.create ||
      (config?.input?.update && inputType === 'update');

    // Existing records are connected by an id object or a bare id value.
    // Relations accepting inline writes take the permissive input model
    // instead, which also covers a lone id. Only one object schema may join
    // the union, since the server strips undeclared properties.
    const itemSchemas: TSchema[] = [
      acceptsInlineWrite ? Type.Ref(`${config.model}RelationInput`) : Id,
      Id.properties.id
    ];

    const isArrayType = type === 'array';
    const isOptional = config?.required === false;

    let inputSchema: TSchema;
    if (isArrayType) {
      // One array of union items, so connect, create, and update inputs mix
      const arraySchema = Type.Array(Type.Union(itemSchemas), options);
      inputSchema = isOptional ? Nullable(arraySchema) : arraySchema;
    } else {
      inputSchema = Type.Union(
        itemSchemas.map((itemSchema) =>
          isOptional ? Nullable(itemSchema) : itemSchema
        )
      );
    }

    return isOptional ? Type.Optional(inputSchema) : inputSchema;
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

  // Relation, file, and count fields are optional in the output models: their
  // presence depends on the inclusion depth of the query. The same schema
  // describes a record nested in another model's output, without relations.
  return Type.Object({
    ...Object.keys(object.properties).reduce((acc, key) => {
      const type = relationOutputType(key);
      if (type) {
        acc[key] = Type.Optional(type);
      }

      const countType = relationCountType(key);
      if (countType) {
        acc[countFieldName(key)] = Type.Optional(countType);
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
