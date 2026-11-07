import {
  capitalize,
  emulatedForeignKeys,
  ForeignKey,
  isArray,
  isPlainObject,
  isResourceAuthModel,
  ResourceModel,
  sqlServerForeignKeys,
  uncapitalize
} from '@appweaver/common';
import { context, currentTransaction } from '@appweaver/core/internal';

/** The database the extension runs its queries on. */
export type ExtendedDatabase = {
  /** Returns the client running in the transaction of the current call */
  client<T = any>(): T;
  /** Runs a function in a transaction, or in the current one */
  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
};

/** What the extension knows of the models, derived from the loaded resources. */
type SqlServerSchema = {
  /** The foreign keys with the actions SQL Server runs */
  foreignKeys: ForeignKey[];
  /** The models whose delete needs the actions of the data layer */
  deleteActions: Set<string>;
  /** The JSON fields of every model */
  jsonFields: Map<string, Set<string>>;
  /** The related model of every relation, file and audit field of every model */
  relatedModels: Map<string, Map<string, string>>;
};

// The operations whose result holds no records
const COUNT_OPERATIONS = new Set([
  'count',
  'aggregate',
  'groupBy',
  'createMany',
  'updateMany',
  'deleteMany'
]);

let cached: { models: ResourceModel[]; schema: SqlServerSchema } | undefined;

/**
 * Creates the Prisma client extension of SQL Server, which has no JSON type and rejects the referential actions forming
 * a cycle or a second path between two tables. The JSON fields are stored serialized in a string column, so they are
 * serialized on every write and parsed in every result. A delete first applies the actions on delete SQL Server leaves
 * to the data layer (see `sqlServerForeignKeys`), cascading to or setting null the referencing records, in the
 * transaction of the delete.
 *
 * @param {ExtendedDatabase} database - The database whose transaction-aware client runs the referential actions.
 * @return {Object} The Prisma client extension.
 */
export function sqlServerExtension(database: ExtendedDatabase): any {
  return {
    name: 'appweaver-sqlserver',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const schema = sqlServerSchema();

          if (
            (operation === 'delete' || operation === 'deleteMany') &&
            schema.deleteActions.has(model)
          ) {
            if (!currentTransaction()) {
              return database.transaction((tx) =>
                tx[uncapitalize(model)][operation](args)
              );
            }
            const client = database.client();
            const records = await client[uncapitalize(model)].findMany({
              where: args?.where,
              select: { id: true }
            });
            await applyDeleteActions(
              client,
              model,
              records.map((record: any) => record.id)
            );
          }

          const result = await query(serializeArgs(model, operation, args));
          return COUNT_OPERATIONS.has(operation)
            ? result
            : parseJsonFields(model, result);
        }
      }
    }
  };
}

/**
 * Cascades to or sets null the records referencing the deleted ones through a foreign key whose action on delete
 * SQL Server leaves to the data layer, and does the same for the records the database cascade deletes with them. A
 * cascade of the data layer deletes through the extension again, so it applies the actions of its records too.
 */
async function applyDeleteActions(
  client: any,
  modelName: string,
  ids: unknown[]
): Promise<void> {
  const { foreignKeys, deleteActions } = sqlServerSchema();
  if (ids.length === 0) {
    return;
  }

  for (const fk of foreignKeys) {
    if (
      fk.referencedName !== modelName ||
      fk.dbOnDelete !== 'cascade' ||
      !deleteActions.has(fk.modelName)
    ) {
      continue;
    }
    const cascaded = await client[uncapitalize(fk.modelName)].findMany({
      where: { [fk.foreignKey]: { in: ids } },
      select: { id: true }
    });
    await applyDeleteActions(
      client,
      fk.modelName,
      cascaded.map((record: any) => record.id)
    );
  }

  for (const fk of emulatedForeignKeys(foreignKeys, modelName)) {
    const delegate = client[uncapitalize(fk.modelName)];
    const referencing = {
      [fk.foreignKey]: { in: ids },
      // The deleted records referencing each other are deleted anyway
      ...(fk.modelName === modelName ? { id: { notIn: ids } } : {})
    };
    if (fk.onDelete === 'cascade') {
      await delegate.deleteMany({ where: referencing });
    } else {
      await delegate.updateMany({
        where: referencing,
        data: { [fk.foreignKey]: null }
      });
    }
  }
}

/** Serializes the JSON fields of the data a write operation stores. */
function serializeArgs(modelName: string, operation: string, args: any): any {
  if (!isPlainObject(args)) {
    return args;
  }

  switch (operation) {
    case 'create':
    case 'createMany':
    case 'createManyAndReturn':
    case 'update':
    case 'updateMany':
    case 'updateManyAndReturn':
      return { ...args, data: serializeData(modelName, args.data) };
    case 'upsert':
      return {
        ...args,
        create: serializeData(modelName, args.create),
        update: serializeData(modelName, args.update)
      };
    default:
      return args;
  }
}

/** Serializes the JSON fields of a record's data, and of the nested writes of its relations. */
function serializeData(modelName: string, data: any): any {
  if (isArray(data)) {
    return data.map((item) => serializeData(modelName, item));
  }
  if (!isPlainObject(data)) {
    return data;
  }

  const schema = sqlServerSchema();
  const jsonFields = schema.jsonFields.get(modelName);
  const relatedModels = schema.relatedModels.get(modelName);

  const serialized: Record<string, any> = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (jsonFields?.has(key) && value !== undefined) {
      serialized[key] = serializeJson(value);
    } else if (relatedModels?.has(key) && isPlainObject(value)) {
      serialized[key] = serializeNestedWrites(relatedModels.get(key)!, value);
    }
  }
  return serialized;
}

/** Serializes the JSON fields of the records a nested relation write stores. */
function serializeNestedWrites(
  modelName: string,
  writes: Record<string, any>
): Record<string, any> {
  const each = (value: any, fn: (item: any) => any) =>
    isArray(value) ? value.map(fn) : fn(value);
  const withData = (item: any) =>
    isPlainObject(item) && 'data' in item
      ? { ...item, data: serializeData(modelName, item.data) }
      : serializeData(modelName, item);

  const serialized: Record<string, any> = { ...writes };
  for (const [action, value] of Object.entries(writes)) {
    switch (action) {
      case 'create':
        serialized[action] = serializeData(modelName, value);
        break;
      case 'createMany':
        serialized[action] = {
          ...value,
          data: serializeData(modelName, value?.data)
        };
        break;
      case 'update':
      case 'updateMany':
        serialized[action] = each(value, withData);
        break;
      case 'upsert':
        serialized[action] = each(value, (item) => ({
          ...item,
          create: serializeData(modelName, item?.create),
          update: serializeData(modelName, item?.update)
        }));
        break;
      case 'connectOrCreate':
        serialized[action] = each(value, (item) => ({
          ...item,
          create: serializeData(modelName, item?.create)
        }));
        break;
    }
  }
  return serialized;
}

/** Serializes a JSON value, storing the null sentinels of Prisma as null. */
function serializeJson(value: unknown): string | null {
  if (value === null || isNullSentinel(value)) {
    return null;
  }
  return JSON.stringify(value);
}

/** Whether a value is `Prisma.DbNull`, `Prisma.JsonNull` or `Prisma.AnyNull`. */
function isNullSentinel(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    /^(Db|Json|Any)Null(Class)?$/.test(value.constructor?.name ?? '')
  );
}

/** Parses the JSON fields of the records of a result, and of their included relations. */
function parseJsonFields(modelName: string, result: any): any {
  if (isArray(result)) {
    return result.map((item) => parseJsonFields(modelName, item));
  }
  if (!isPlainObject(result)) {
    return result;
  }

  const schema = sqlServerSchema();
  const jsonFields = schema.jsonFields.get(modelName);
  const relatedModels = schema.relatedModels.get(modelName);

  for (const [key, value] of Object.entries(result)) {
    if (jsonFields?.has(key) && typeof value === 'string') {
      result[key] = JSON.parse(value);
    } else if (relatedModels?.has(key) && value !== null) {
      result[key] = parseJsonFields(relatedModels.get(key)!, value);
    }
  }
  return result;
}

/**
 * The models whose delete needs the actions of the data layer: the ones referenced through a foreign key whose action
 * the database leaves out, and the ones the database cascades from to such a model.
 */
function deleteActionModels(foreignKeys: ForeignKey[]): Set<string> {
  const models = new Set(
    foreignKeys
      .filter((fk) => emulatedForeignKeys([fk], fk.referencedName).length > 0)
      .map((fk) => fk.referencedName)
  );

  for (let size = -1; size !== models.size; ) {
    size = models.size;
    for (const fk of foreignKeys) {
      if (fk.dbOnDelete === 'cascade' && models.has(fk.modelName)) {
        models.add(fk.referencedName);
      }
    }
  }
  return models;
}

/** Derives the schema of the loaded models, recomputed when the models change. */
function sqlServerSchema(): SqlServerSchema {
  const loaded = [
    ...(context.resource.models as Map<string, ResourceModel>).values()
  ];
  if (
    cached?.models.length === loaded.length &&
    cached.models.every((model, i) => model === loaded[i])
  ) {
    return cached.schema;
  }

  const models = Object.fromEntries(loaded.map((m) => [m.name, m]));
  const authModel = Object.values(models).find(isResourceAuthModel);
  const jsonFields = new Map<string, Set<string>>();
  const relatedModels = new Map<string, Map<string, string>>();

  for (const model of Object.values(models)) {
    jsonFields.set(
      model.name,
      new Set(
        Object.entries(model.config.scalars ?? {})
          .filter(([, scalar]) => scalar.type === 'json')
          .map(([field]) => field)
      )
    );

    const related = new Map<string, string>();
    for (const [field, relation] of Object.entries(
      model.config.relations ?? {}
    )) {
      related.set(field, capitalize(relation.model));
    }
    for (const field of Object.keys(model.config.files ?? {})) {
      related.set(field, 'File');
    }
    if (authModel) {
      related.set('createdBy', authModel.name);
      related.set('deletedBy', authModel.name);
    }
    relatedModels.set(model.name, related);
  }

  const foreignKeys = sqlServerForeignKeys(models);
  const schema = {
    foreignKeys,
    deleteActions: deleteActionModels(foreignKeys),
    jsonFields,
    relatedModels
  };
  cached = { models: loaded, schema };
  return schema;
}
