import { createModel } from '../../factory/create-model';
import {
  buildVirtualProjectionPlan,
  createVirtualProjectionHook,
  VirtualProjectionPlan
} from '../../server/virtual-projection';
import { resetContext } from '../fixtures/context-fixture';
import { linkModels } from '../fixtures/model-fixture';

const noSchema = () => undefined;

const reply = (statusCode: number) => ({ statusCode }) as any;

const applyHook = async (
  plan: VirtualProjectionPlan,
  payload: any,
  status = 200
) =>
  createVirtualProjectionHook(plan).call(
    {} as any,
    {} as any,
    reply(status),
    payload
  );

describe('virtual-projection', () => {
  beforeEach(() => {
    resetContext();

    createModel({
      name: 'Post',
      scalars: { title: { type: 'string' } },
      virtual: {
        excerpt: {
          type: 'string',
          output: { value: (post: any) => `${post.title}...` }
        }
      }
    });
    createModel({ name: 'Tag', scalars: { name: { type: 'string' } } });
    linkModels();
  });

  afterAll(() => {
    resetContext();
  });

  describe('buildVirtualProjectionPlan', () => {
    test('records a resource schema referenced at the response root', () => {
      const plan = buildVirtualProjectionPlan(
        { 200: { $ref: 'PostSingle' } },
        noSchema
      );

      expect(plan).toEqual({
        '200': [{ path: [], resourceName: 'Post' }]
      });
    });

    test('records the resource of a schema given by its id', () => {
      const plan = buildVirtualProjectionPlan(
        { 200: { $id: 'PostMultiple', type: 'object' } },
        noSchema
      );

      expect(plan['200']).toEqual([{ path: [], resourceName: 'Post' }]);
    });

    test('records the path of a nested resource property', () => {
      const plan = buildVirtualProjectionPlan(
        {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { $ref: 'PostMultiple' } },
              totalCount: { type: 'integer' }
            }
          }
        },
        noSchema
      );

      expect(plan['200']).toEqual([
        { path: ['items', '[]'], resourceName: 'Post' }
      ]);
    });

    test('resolves references through the schema lookup', () => {
      const schemas: Record<string, unknown> = {
        QueryResponse: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: 'PostSingle' } }
          }
        }
      };

      const plan = buildVirtualProjectionPlan(
        { 200: { $ref: 'QueryResponse' } },
        (id) => schemas[id]
      );

      expect(plan['200']).toEqual([
        { path: ['items', '[]'], resourceName: 'Post' }
      ]);
    });

    test('unwraps OpenAPI media type content', () => {
      const plan = buildVirtualProjectionPlan(
        {
          200: {
            content: { 'application/json': { schema: { $ref: 'PostSingle' } } }
          }
        },
        noSchema
      );

      expect(plan['200']).toEqual([{ path: [], resourceName: 'Post' }]);
    });

    test('descends into composite schema branches', () => {
      const plan = buildVirtualProjectionPlan(
        {
          200: {
            allOf: [
              { type: 'object', properties: { post: { $ref: 'PostSingle' } } }
            ]
          }
        },
        noSchema
      );

      expect(plan['200']).toEqual([{ path: ['post'], resourceName: 'Post' }]);
    });

    test('skips schemas of resources without virtual fields', () => {
      const plan = buildVirtualProjectionPlan(
        { 200: { $ref: 'TagSingle' } },
        noSchema
      );

      expect(plan).toEqual({});
    });

    test('skips schemas that do not belong to a resource', () => {
      const plan = buildVirtualProjectionPlan(
        { 200: { $ref: 'SomeOtherSchema' } },
        noSchema
      );

      expect(plan).toEqual({});
    });

    test('only plans successful responses', () => {
      const plan = buildVirtualProjectionPlan(
        {
          200: { $ref: 'PostSingle' },
          201: { $ref: 'PostSingle' },
          '2xx': { $ref: 'PostSingle' },
          400: { $ref: 'PostSingle' },
          500: { $ref: 'PostSingle' }
        },
        noSchema
      );

      expect(Object.keys(plan).sort()).toEqual(['200', '201', '2xx']);
    });

    test('returns an empty plan without response schemas', () => {
      expect(buildVirtualProjectionPlan(undefined, noSchema)).toEqual({});
      expect(buildVirtualProjectionPlan({}, noSchema)).toEqual({});
    });

    test('records each resource path only once', () => {
      const plan = buildVirtualProjectionPlan(
        {
          200: {
            allOf: [
              { type: 'object', properties: { post: { $ref: 'PostSingle' } } },
              { type: 'object', properties: { post: { $ref: 'PostMultiple' } } }
            ]
          }
        },
        noSchema
      );

      expect(plan['200']).toHaveLength(1);
    });

    test('stops at circular schema references', () => {
      const schemas: Record<string, any> = {
        Node: { type: 'object', properties: { child: { $ref: 'Node' } } }
      };

      expect(() =>
        buildVirtualProjectionPlan(
          { 200: { $ref: 'Node' } },
          (id) => schemas[id]
        )
      ).not.toThrow();
    });
  });

  describe('createVirtualProjectionHook', () => {
    test('projects the virtual fields of the response payload', async () => {
      const plan = buildVirtualProjectionPlan(
        { 200: { $ref: 'PostSingle' } },
        noSchema
      );

      const payload = await applyHook(plan, { id: 1, title: 'First' });

      expect(payload).toEqual({ id: 1, title: 'First', excerpt: 'First...' });
    });

    test('projects every item of an array payload', async () => {
      const plan = buildVirtualProjectionPlan(
        {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { $ref: 'PostMultiple' } }
            }
          }
        },
        noSchema
      );

      const payload: any = await applyHook(plan, {
        items: [
          { id: 1, title: 'First' },
          { id: 2, title: 'Second' }
        ],
        totalCount: 2
      });

      expect(payload.items.map((item: any) => item.excerpt)).toEqual([
        'First...',
        'Second...'
      ]);
      expect(payload.totalCount).toBe(2);
    });

    test('falls back to the 2xx plan entry', async () => {
      const plan = buildVirtualProjectionPlan(
        { '2xx': { $ref: 'PostSingle' } },
        noSchema
      );

      const payload = await applyHook(plan, { id: 1, title: 'First' }, 204);

      expect(payload).toEqual({ id: 1, title: 'First', excerpt: 'First...' });
    });

    test('returns the payload unchanged without a matching plan entry', async () => {
      const plan = buildVirtualProjectionPlan(
        { 200: { $ref: 'PostSingle' } },
        noSchema
      );

      const payload = { id: 1, title: 'First' };

      await expect(applyHook(plan, payload, 404)).resolves.toBe(payload);
    });

    test('returns non object payloads unchanged', async () => {
      const plan = buildVirtualProjectionPlan(
        { 200: { $ref: 'PostSingle' } },
        noSchema
      );

      await expect(applyHook(plan, 'plain text')).resolves.toBe('plain text');
      await expect(applyHook(plan, null)).resolves.toBeNull();
    });

    test('returns the payload unchanged for an empty plan', async () => {
      const payload = { id: 1, title: 'First' };

      await expect(applyHook({}, payload)).resolves.toBe(payload);
    });

    test('leaves a payload that does not match the path unchanged', async () => {
      const plan = buildVirtualProjectionPlan(
        {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { $ref: 'PostMultiple' } }
            }
          }
        },
        noSchema
      );

      const payload = { other: 'value' };

      await expect(applyHook(plan, payload)).resolves.toEqual({
        other: 'value'
      });
    });

    test('keeps the payload when the projection fails', async () => {
      createModel(
        {
          name: 'Post',
          virtual: {
            broken: {
              type: 'string',
              output: {
                value: () => {
                  throw new Error('projection failure');
                }
              }
            }
          }
        },
        true
      );
      linkModels();

      const plan = buildVirtualProjectionPlan(
        { 200: { $ref: 'PostSingle' } },
        noSchema
      );
      const payload = { id: 1, title: 'First' };

      await expect(applyHook(plan, payload)).resolves.toBe(payload);
    });
  });
});
