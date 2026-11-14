import {
  DatabaseType,
  DURATION_BUCKETS,
  recordDuration,
  SpanKind,
  spanErrorType,
  telemetryHistogram,
  withSpan
} from '@appweaver/common';

// The names of the databases in the OpenTelemetry semantic conventions
const DB_SYSTEMS: Record<DatabaseType, string> = {
  [DatabaseType.Sqlite]: 'sqlite',
  [DatabaseType.PostgreSQL]: 'postgresql',
  [DatabaseType.MySQL]: 'mysql',
  [DatabaseType.SQLServer]: 'microsoft.sql_server'
};

const operationDuration = telemetryHistogram('db.client.operation.duration', {
  description: 'Duration of the database operations.',
  unit: 's',
  advice: { explicitBucketBoundaries: DURATION_BUCKETS }
});

/**
 * Creates the Prisma client extension tracing every operation of the client in a client span named after the
 * operation and its model (`findMany User`, `$queryRaw`), and measuring its duration. Neither the query nor its
 * arguments are recorded.
 *
 * @param {DatabaseType} dbType - The type of the database.
 * @return {Object} The Prisma client extension.
 */
export function telemetryExtension(dbType: DatabaseType): any {
  const system = DB_SYSTEMS[dbType];
  return {
    name: 'appweaver-telemetry',
    query: {
      $allOperations({
        model,
        operation,
        args,
        query
      }: {
        model?: string;
        operation: string;
        args: unknown;
        query: (args: unknown) => Promise<unknown>;
      }) {
        const attributes = {
          'db.system.name': system,
          'db.operation.name': operation,
          ...(model ? { 'db.collection.name': model } : {})
        };
        const start = performance.now();
        // The query starts in the same tick, so it stays in the transaction
        // of a batch
        return withSpan(
          model ? `${operation} ${model}` : operation,
          { kind: SpanKind.CLIENT, attributes },
          () => query(args)
        ).then(
          (result) => {
            recordDuration(operationDuration(), start, attributes);
            return result;
          },
          (error) => {
            recordDuration(operationDuration(), start, {
              ...attributes,
              'error.type': spanErrorType(error)
            });
            throw error;
          }
        );
      }
    }
  };
}
