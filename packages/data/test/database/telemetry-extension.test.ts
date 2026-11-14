import {
  DatabaseType,
  SpanKind,
  SpanStatusCode,
  withSpan
} from '@appweaver/common';
import { recordTelemetry, TelemetryRecorder } from '@appweaver/testing';
import { telemetryExtension } from '../../database/telemetry-extension';

describe('telemetry-extension', () => {
  let telemetry: TelemetryRecorder;

  const operation = (dbType: DatabaseType = DatabaseType.PostgreSQL) =>
    telemetryExtension(dbType).query.$allOperations;

  beforeEach(() => {
    telemetry = recordTelemetry();
  });

  afterEach(async () => {
    await telemetry.stop();
  });

  test('is a named Prisma client extension', () => {
    expect(telemetryExtension(DatabaseType.Sqlite).name).toBe(
      'appweaver-telemetry'
    );
  });

  test('records a client span named after the operation and its model', async () => {
    const query = jest.fn(async () => [{ id: 1 }]);
    const args = { where: { secret: 'value' } };

    const result = await withSpan('request', {}, () =>
      operation()({ model: 'User', operation: 'findMany', args, query })
    );

    expect(result).toEqual([{ id: 1 }]);
    expect(query).toHaveBeenCalledWith(args);
    const span = telemetry.span('findMany User');
    expect(span.kind).toBe(SpanKind.CLIENT);
    // Neither the query nor its arguments are recorded
    expect(span.attributes).toEqual({
      'db.system.name': 'postgresql',
      'db.operation.name': 'findMany',
      'db.collection.name': 'User'
    });
    expect(span.parentSpanContext?.spanId).toBe(
      telemetry.span('request').spanContext().spanId
    );
  });

  test('names the span of a raw query after its operation', async () => {
    await operation(DatabaseType.SQLServer)({
      operation: '$queryRaw',
      args: {},
      query: async () => []
    });

    expect(telemetry.span('$queryRaw').attributes).toEqual({
      'db.system.name': 'microsoft.sql_server',
      'db.operation.name': '$queryRaw'
    });
  });

  test('starts the query in the same tick, as a batch transaction requires', () => {
    const query = jest.fn(async () => 1);

    void operation()({ model: 'Post', operation: 'create', args: {}, query });

    expect(query).toHaveBeenCalledTimes(1);
  });

  test('records the error of a failed operation and rejects with it', async () => {
    const error = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002'
    });

    await expect(
      operation(DatabaseType.MySQL)({
        model: 'Post',
        operation: 'create',
        args: {},
        query: async () => {
          throw error;
        }
      })
    ).rejects.toBe(error);

    const span = telemetry.span('create Post');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes['error.type']).toBe('P2002');
  });

  test('measures the duration of the operations', async () => {
    await operation(DatabaseType.Sqlite)({
      model: 'Post',
      operation: 'count',
      args: {},
      query: async () => 3
    });
    await operation(DatabaseType.Sqlite)({
      model: 'Post',
      operation: 'count',
      args: {},
      query: async () => {
        throw new TypeError('closed');
      }
    }).catch(() => undefined);

    const metric = await telemetry.metric('db.client.operation.duration');
    expect(metric?.descriptor.unit).toBe('s');
    expect(metric?.dataPoints.map((point) => point.attributes)).toEqual([
      {
        'db.system.name': 'sqlite',
        'db.operation.name': 'count',
        'db.collection.name': 'Post'
      },
      {
        'db.system.name': 'sqlite',
        'db.operation.name': 'count',
        'db.collection.name': 'Post',
        'error.type': 'TypeError'
      }
    ]);
  });
});
