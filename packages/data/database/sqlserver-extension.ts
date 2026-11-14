import {
  emulatedForeignKeys,
  ForeignKey,
  ResourceModel,
  sqlServerForeignKeys,
  uncapitalize
} from '@appweaver/common';
import { context, currentTransaction } from '@appweaver/core/internal';
import { mapResultRecords, mapWriteArgs } from '../utils/write-data-util';

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
  return mapWriteArgs(modelName, operation, args, serializeRecord);
}

/** Serializes the JSON fields of the data of a record. */
function serializeRecord(
  modelName: string,
  data: Record<string, any>
): Record<string, any> {
  const jsonFields = sqlServerSchema().jsonFields.get(modelName);
  const serialized: Record<string, any> = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (jsonFields?.has(key) && value !== undefined) {
      serialized[key] = serializeJson(value);
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
  return mapResultRecords(modelName, result, parseRecord);
}

/** Parses the JSON fields of a record. */
function parseRecord(
  modelName: string,
  record: Record<string, any>
): Record<string, any> {
  const jsonFields = sqlServerSchema().jsonFields.get(modelName);
  for (const [key, value] of Object.entries(record)) {
    if (jsonFields?.has(key) && typeof value === 'string') {
      record[key] = JSON.parse(value);
    }
  }
  return record;
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
  const jsonFields = new Map<string, Set<string>>();

  for (const model of Object.values(models)) {
    jsonFields.set(
      model.name,
      new Set([
        ...Object.entries(model.config.scalars ?? {})
          .filter(([, scalar]) => scalar.type === 'json')
          .map(([field]) => field),
        // A geo field holds its GeoJSON geometry
        ...Object.keys(model.config.geo ?? {})
      ])
    );
  }

  const foreignKeys = sqlServerForeignKeys(models);
  const schema = {
    foreignKeys,
    deleteActions: deleteActionModels(foreignKeys),
    jsonFields
  };
  cached = { models: loaded, schema };
  return schema;
}
