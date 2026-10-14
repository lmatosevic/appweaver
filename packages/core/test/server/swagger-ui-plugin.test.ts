import { swaggerUiFilterPlugin } from '../../server/swagger-ui-plugin';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** Runs a spec through the wrapped `updateJsonSpec` action of the plugin. */
const update = (spec: any): any => {
  const updateJsonSpec =
    swaggerUiFilterPlugin().statePlugins.spec.wrapActions.updateJsonSpec;
  return updateJsonSpec((updated: any) => updated)(spec);
};

describe('swagger-ui-plugin', () => {
  describe('swaggerUiFilterPlugin', () => {
    test('stubs the references between different query filters', () => {
      const spec = update({
        paths: { '/tags/query': { get: { schema: ref('def-1') } } },
        components: {
          schemas: {
            'def-0': { title: 'QueryCondition', properties: {} },
            'def-1': {
              title: 'TagQueryFilter',
              properties: {
                _and: { anyOf: [ref('def-1'), { items: ref('def-1') }] },
                name: { anyOf: [{ type: 'string' }, ref('def-0')] },
                posts: {
                  anyOf: [ref('def-2'), { type: 'array', items: ref('def-2') }]
                }
              }
            },
            'def-2': {
              title: 'PostQueryFilter',
              properties: { tags: ref('def-1') }
            },
            'def-3': {
              title: 'TagQueryRequest',
              properties: { filter: ref('def-1') }
            }
          }
        }
      });

      const { schemas } = spec.components;
      const stub = (title: string) => ({
        type: 'object',
        title,
        description: `A nested ${title}, see its schema`
      });

      expect(schemas['def-1'].properties).toEqual({
        _and: { anyOf: [ref('def-1'), { items: ref('def-1') }] },
        name: { anyOf: [{ type: 'string' }, ref('def-0')] },
        posts: {
          anyOf: [
            stub('PostQueryFilter'),
            { type: 'array', items: stub('PostQueryFilter') }
          ]
        }
      });
      expect(schemas['def-2'].properties.tags).toEqual(stub('TagQueryFilter'));
      expect(schemas['def-3'].properties.filter).toEqual(ref('def-1'));
      expect(spec.paths['/tags/query'].get.schema).toEqual(ref('def-1'));
    });

    test('keeps the description of a stubbed reference', () => {
      const spec = update({
        components: {
          schemas: {
            'def-1': {
              title: 'TagQueryFilter',
              properties: {
                posts: { ...ref('def-2'), description: 'Related posts' }
              }
            },
            'def-2': { title: 'PostQueryFilter', properties: {} }
          }
        }
      });

      expect(spec.components.schemas['def-1'].properties.posts).toEqual({
        type: 'object',
        title: 'PostQueryFilter',
        description: 'Related posts'
      });
    });

    test('passes a spec without schemas through unchanged', () => {
      const spec = { paths: {} };

      expect(update(spec)).toBe(spec);
      expect(update(undefined)).toBeUndefined();
    });
  });
});
