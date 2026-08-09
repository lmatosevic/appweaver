import { Type } from '@sinclair/typebox';
import Fastify, { FastifyInstance } from 'fastify';
import { context } from '../../../context';
import { createModel } from '../../../factory/create-model';
import {
  AGGREGATE_DATE_SCHEMA_NAME,
  AGGREGATE_NUMERIC_SCHEMA_NAME,
  aggregateDateFieldSchema,
  aggregateSelectName,
  AggregateDateSchema,
  AggregateNumericSchema,
  buildAggregateSelectSchema
} from '../../../resource/schemas/resource-aggregate-schema';
import { resetContext } from '../../fixtures/context-fixture';

/**
 * Builds a server validating a request body against a model's aggregate
 * selection schema with the same options the application server uses. The
 * `removeAdditional` option makes the validator strip every property that the
 * matched schema does not declare.
 */
async function server(modelName: string): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: { removeAdditional: 'all', allowUnionTypes: true },
      plugins: [(ajv): any => ajv.addKeyword('example')]
    }
  });

  app.addSchema({
    ...AggregateNumericSchema,
    $id: AGGREGATE_NUMERIC_SCHEMA_NAME
  });
  app.addSchema({ ...AggregateDateSchema, $id: AGGREGATE_DATE_SCHEMA_NAME });

  const model = context.resource.models.get(modelName)!;
  for (const registered of context.resource.models.values()) {
    app.addSchema({
      ...buildAggregateSelectSchema(registered),
      $id: aggregateSelectName(registered.name)
    });
  }

  app.post(
    '/',
    {
      schema: {
        body: Type.Object({
          select: Type.Ref(aggregateSelectName(modelName)),
          dateField: aggregateDateFieldSchema(model)
        })
      }
    },
    // Echoes the validated body, so the test can assert on what survived
    async (request) => request.body as any
  );

  await app.ready();
  return app;
}

/** Sends the payload through request validation and returns what survived. */
async function validated(app: FastifyInstance, payload: any): Promise<any> {
  const response = await app.inject({ method: 'POST', url: '/', payload });
  return { status: response.statusCode, body: response.json() };
}

describe('aggregate schema', () => {
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    resetContext();

    createModel({
      name: 'User',
      scalars: { firstName: { type: 'string' } }
    });
    createModel({
      name: 'Post',
      scalars: {
        title: { type: 'string' },
        views: { type: 'int' },
        rating: { type: 'float' },
        publishedAt: { type: 'dateTime' },
        enabled: { type: 'boolean' },
        scores: { type: 'int', array: true },
        secret: { type: 'int', hidden: true }
      },
      virtual: {
        score: { type: 'float', output: { value: () => 1 } }
      },
      relations: {
        author: { model: 'User', type: 'oneToMany', owner: true }
      }
    });

    app = await server('Post');
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(() => {
    resetContext();
  });

  test('keeps the operators of the numeric fields', async () => {
    const { status, body } = await validated(app!, {
      select: {
        views: {
          count: true,
          sum: true,
          avg: true,
          min: true,
          max: true,
          first: true,
          last: true
        },
        rating: { avg: true }
      }
    });

    expect(status).toBe(200);
    expect(body.select).toEqual({
      views: {
        count: true,
        sum: true,
        avg: true,
        min: true,
        max: true,
        first: true,
        last: true
      },
      rating: { avg: true }
    });
  });

  test('keeps the boundary operators of a date field', async () => {
    const { status, body } = await validated(app!, {
      select: { publishedAt: { first: true, last: true } }
    });

    expect(status).toBe(200);
    expect(body.select).toEqual({ publishedAt: { first: true, last: true } });
  });

  test('keeps the operators of the id, audit and date fields', async () => {
    const { status, body } = await validated(app!, {
      select: {
        id: { count: true },
        createdById: { max: true },
        createdAt: { min: true, max: true },
        publishedAt: { count: true }
      }
    });

    expect(status).toBe(200);
    expect(body.select).toEqual({
      id: { count: true },
      createdById: { max: true },
      createdAt: { min: true, max: true },
      publishedAt: { count: true }
    });
  });

  test('strips the sum and avg operators of a date field', async () => {
    const { status, body } = await validated(app!, {
      select: { publishedAt: { sum: true, avg: true, min: true } }
    });

    expect(status).toBe(200);
    expect(body.select).toEqual({ publishedAt: { min: true } });
  });

  test('strips the fields that cannot be aggregated', async () => {
    const { status, body } = await validated(app!, {
      select: {
        title: { count: true },
        enabled: { count: true },
        scores: { sum: true },
        secret: { sum: true },
        score: { avg: true },
        author: { count: true },
        unknown: { count: true },
        views: { sum: true }
      }
    });

    expect(status).toBe(200);
    expect(body.select).toEqual({ views: { sum: true } });
  });

  test('rejects a missing selection', async () => {
    const { status } = await validated(app!, { dateField: 'createdAt' });

    expect(status).toBe(400);
  });

  test('rejects a non-boolean operator value', async () => {
    const { status } = await validated(app!, {
      select: { views: { sum: 'yes' } }
    });

    expect(status).toBe(400);
  });

  test('keeps a date field of the model', async () => {
    const { status, body } = await validated(app!, {
      select: { views: { sum: true } },
      dateField: 'publishedAt'
    });

    expect(status).toBe(200);
    expect(body.dateField).toBe('publishedAt');
  });

  test('rejects a date field that the model does not declare', async () => {
    const { status } = await validated(app!, {
      select: { views: { sum: true } },
      dateField: 'views'
    });

    expect(status).toBe(400);
  });
});
