import {
  capitalize,
  isArray,
  isPlainObject,
  isResourceAuthModel,
  ResourceModel
} from '@appweaver/common';
import { context } from '@appweaver/core/internal';

/** Maps the data of a record a write stores, the nested writes of its relations excluded. */
export type RecordMapper = (
  modelName: string,
  data: Record<string, any>
) => Record<string, any>;

/** The related model of every relation, file and audit field of every model, by the names of the model and the field. */
type RelatedModels = Map<string, Map<string, string>>;

let cached: { models: ResourceModel[]; related: RelatedModels } | undefined;

/**
 * Maps the data of the records a write operation stores, and of the nested writes of their relations, i.e. to
 * serialize the JSON fields of SQL Server.
 *
 * @param {string} modelName - The model the operation runs on.
 * @param {string} operation - The Prisma operation, i.e. `create`.
 * @param {any} args - The arguments of the operation.
 * @param {RecordMapper} mapRecord - Maps the data of a record.
 * @return {any} The mapped arguments.
 */
export function mapWriteArgs(
  modelName: string,
  operation: string,
  args: any,
  mapRecord: RecordMapper
): any {
  if (!isPlainObject(args)) {
    return args;
  }

  const related = relatedModels();
  const map = (data: any) => mapWriteData(modelName, data, mapRecord, related);
  switch (operation) {
    case 'create':
    case 'createMany':
    case 'createManyAndReturn':
    case 'update':
    case 'updateMany':
    case 'updateManyAndReturn':
      return { ...args, data: map(args.data) };
    case 'upsert':
      return { ...args, create: map(args.create), update: map(args.update) };
    default:
      return args;
  }
}

/**
 * Maps the records of a result, and of their included relations, i.e. to parse the JSON fields of SQL Server.
 *
 * @param {string} modelName - The model of the records.
 * @param {any} result - The result, a record or a list of them.
 * @param {RecordMapper} mapRecord - Maps a record.
 * @return {any} The mapped result.
 */
export function mapResultRecords(
  modelName: string,
  result: any,
  mapRecord: RecordMapper
): any {
  return mapRecords(modelName, result, mapRecord, relatedModels());
}

function mapRecords(
  modelName: string,
  result: any,
  mapRecord: RecordMapper,
  related: RelatedModels
): any {
  if (isArray(result)) {
    return result.map((item) =>
      mapRecords(modelName, item, mapRecord, related)
    );
  }
  if (!isPlainObject(result)) {
    return result;
  }

  const record = mapRecord(modelName, result);
  const fields = related.get(modelName);
  for (const [key, value] of Object.entries(record)) {
    if (fields?.has(key) && value !== null) {
      record[key] = mapRecords(fields.get(key)!, value, mapRecord, related);
    }
  }
  return record;
}

/** The related models of the loaded models, recomputed when the models change. */
function relatedModels(): RelatedModels {
  const loaded = [
    ...(context.resource.models as Map<string, ResourceModel>).values()
  ];
  if (
    cached?.models.length === loaded.length &&
    cached.models.every((model, i) => model === loaded[i])
  ) {
    return cached.related;
  }

  const authModel = loaded.find(isResourceAuthModel);
  const related: RelatedModels = new Map();
  for (const model of loaded) {
    const fields = new Map<string, string>();
    for (const [field, relation] of Object.entries(
      model.config.relations ?? {}
    )) {
      fields.set(field, capitalize(relation.model));
    }
    for (const field of Object.keys(model.config.files ?? {})) {
      fields.set(field, 'File');
    }
    if (authModel) {
      fields.set('createdBy', authModel.name);
      fields.set('deletedBy', authModel.name);
    }
    related.set(model.name, fields);
  }
  cached = { models: loaded, related };
  return related;
}

function mapWriteData(
  modelName: string,
  data: any,
  mapRecord: RecordMapper,
  related: RelatedModels
): any {
  if (isArray(data)) {
    return data.map((item) =>
      mapWriteData(modelName, item, mapRecord, related)
    );
  }
  if (!isPlainObject(data)) {
    return data;
  }

  const mapped = mapRecord(modelName, data);
  const fields = related.get(modelName);
  for (const [key, value] of Object.entries(mapped)) {
    if (fields?.has(key) && isPlainObject(value)) {
      mapped[key] = mapNestedWrites(
        fields.get(key)!,
        value,
        mapRecord,
        related
      );
    }
  }
  return mapped;
}

function mapNestedWrites(
  modelName: string,
  writes: Record<string, any>,
  mapRecord: RecordMapper,
  related: RelatedModels
): Record<string, any> {
  const map = (data: any) => mapWriteData(modelName, data, mapRecord, related);
  const each = (value: any, fn: (item: any) => any) =>
    isArray(value) ? value.map(fn) : fn(value);
  const withData = (item: any) =>
    isPlainObject(item) && 'data' in item
      ? { ...item, data: map(item.data) }
      : map(item);

  const mapped: Record<string, any> = { ...writes };
  for (const [action, value] of Object.entries(writes)) {
    switch (action) {
      case 'create':
        mapped[action] = map(value);
        break;
      case 'createMany':
        mapped[action] = { ...value, data: map(value?.data) };
        break;
      case 'update':
      case 'updateMany':
        mapped[action] = each(value, withData);
        break;
      case 'upsert':
        mapped[action] = each(value, (item) => ({
          ...item,
          create: map(item?.create),
          update: map(item?.update)
        }));
        break;
      case 'connectOrCreate':
        mapped[action] = each(value, (item) => ({
          ...item,
          create: map(item?.create)
        }));
        break;
    }
  }
  return mapped;
}
