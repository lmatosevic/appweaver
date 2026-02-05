import path from 'node:path';
import { TSchema, Type } from '@sinclair/typebox';
import {
  AuditFields,
  capitalize,
  FileField,
  IdField,
  pickObjectProperties,
  RelationField,
  ResourceModel,
  ScalarField
} from '@appweaver/common';
import { AuditData, Id, IdString } from '../resource';
import { File } from '../storage';
import { Nullable, StringDate, StringEnum } from '../utils';

export type ModelVariants = {
  readModel: TSchema;
  createModel: TSchema;
  updateModel: TSchema;
  virtualModel: TSchema;
  filesModel: TSchema;
  relationsModel: TSchema;
};

export function createModel(model: ResourceModel): ModelVariants {
  const name = capitalize(model.name ?? path.basename(path.dirname(__dirname)));

  const idSchema = buildIdSchema(model?.id);
  const auditSchema = buildAuditSchema(model?.audit);
  const scalarsSchema = buildScalarsSchema(model?.scalars);
  const virtualSchema = buildScalarsSchema(model?.virtual);
  const filesSchema = buildFilesSchema(model?.files);
  const relationsSchema = buildRelationsSchema(model?.relations);

  const readModel = Type.Composite([idSchema, scalarsSchema, auditSchema], {
    $id: `${name}`
  });

  const virtualModel = Type.Object(virtualSchema, {
    $id: `${name}Virtual`
  });

  const filesModel = Type.Object(filesSchema, {
    $id: `${name}Files`
  });

  const relationsModel = Type.Object(relationsSchema, {
    $id: `${name}Relations`
  });

  let createModel = Type.Omit(
    readModel,
    [...Object.keys(idSchema), ...Object.keys(auditSchema)],
    { $id: `${name}Create` }
  );

  let updateModel = Type.Partial(createModel, { $id: `${name}Update` });

  if (model.create) {
    if (model.create.pick) {
      createModel = Type.Pick(createModel, model.create.pick);
    }
    if (model.create.omit) {
      createModel = Type.Pick(createModel, model.create.omit);
    }
  }

  if (model.update) {
    if (model.update.pick) {
      updateModel = Type.Pick(createModel, model.update.pick);
    }
    if (model.update.omit) {
      updateModel = Type.Pick(createModel, model.update.omit);
    }
  }

  return {
    readModel,
    createModel,
    updateModel,
    virtualModel,
    filesModel,
    relationsModel
  };
}

function buildIdSchema(idField: IdField = { type: 'int' }): TSchema {
  let idType: TSchema;

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
): TSchema {
  const fields: string[] = [];

  for (const [name, included] of Object.entries(auditFields)) {
    if (included) {
      fields.push(name);
    }
  }

  return Type.Pick(AuditData, fields);
}

function buildScalarsSchema(fields: Record<string, ScalarField> = {}): TSchema {
  return Object.entries(fields ?? {})
    .map(([name, field]) => buildScalarSchema(name, field))
    .reduce((acc, schema) => Type.Intersect([acc, schema]), Type.Object({}));
}

function buildScalarSchema(name: string, field: ScalarField): TSchema {
  let fieldType: TSchema;

  switch (field.type) {
    case 'text':
    case 'blob':
      fieldType = Type.String(
        pickObjectProperties(field, [
          'minLength',
          'maxLength',
          'format',
          'pattern'
        ])
      );
      break;
    case 'int':
    case 'bigInt':
      fieldType = Type.Integer(
        pickObjectProperties(field, ['minimum', 'maximum'])
      );
      break;
    case 'float':
      fieldType = Type.Number(
        pickObjectProperties(field, ['minimum', 'maximum'])
      );
      break;
    case 'boolean':
      fieldType = Type.Boolean({});
      break;
    case 'dateTime':
      fieldType = StringDate();
      break;
    case 'json':
      fieldType = Type.Any();
      break;
    case 'enum':
      fieldType = StringEnum(field.values ?? []);
      break;
  }

  if (field.array === true) {
    fieldType = Type.Array(fieldType);
  }

  if (field.required === false) {
    fieldType = Nullable(fieldType);
  }

  return Type.Object({ [name]: fieldType });
}

function buildFilesSchema(files: Record<string, FileField> = {}): TSchema {
  return Object.entries(files ?? {})
    .map(([name, file]) => buildFileSchema(name, file))
    .reduce((acc, schema) => Type.Intersect([acc, schema]), Type.Object({}));
}

function buildFileSchema(name: string, file: FileField): TSchema {
  return Type.Object({
    [name]: file.array ? Type.Array(File) : File
  });
}

function buildRelationsSchema(
  relations: Record<string, RelationField> = {}
): TSchema {
  return Object.entries(relations ?? {})
    .map(([name, relation]) => buildRelationSchema(name, relation))
    .reduce((acc, schema) => Type.Intersect([acc, schema]), Type.Object({}));
}

function buildRelationSchema(name: string, relation: RelationField): TSchema {
  const modelName = capitalize(relation.references.model);
  let relationType: TSchema = Type.Ref(modelName);

  relationType =
    relation.references.type !== 'oneToOne'
      ? Type.Array(relationType, pickObjectProperties(relation, ['minItems']))
      : relationType;

  return Type.Object({
    [name]:
      relation.required === false ? Type.Optional(relationType) : relationType
  });
}
