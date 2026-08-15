import { OpenAPI3 } from 'openapi-typescript';
import { hoistSharedTypes } from '../../utils/hoist-util';

describe('hoist-util', () => {
  describe('hoistSharedTypes', () => {
    const sortDirection = () => ({
      type: 'string',
      enum: ['asc', 'desc'],
      example: 'desc'
    });

    const createSchema = (schemas: Record<string, unknown>): OpenAPI3 =>
      ({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
        components: { schemas }
      }) as OpenAPI3;

    test('hoists a well known enum under its shared name', () => {
      const schema = createSchema({
        'def-1': {
          title: 'PostQuerySort',
          type: 'object',
          properties: { id: sortDirection(), title: sortDirection() }
        }
      });

      expect(hoistSharedTypes(schema)).toEqual(['SortDirection']);

      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['SortDirection']).toEqual({
        title: 'SortDirection',
        type: 'string',
        enum: ['asc', 'desc']
      });
      expect(schemas['def-1'].properties).toEqual({
        id: { example: 'desc', $ref: '#/components/schemas/SortDirection' },
        title: { example: 'desc', $ref: '#/components/schemas/SortDirection' }
      });
    });

    test('names an unknown enum after the definitions sharing it', () => {
      const status = () => ({ type: 'string', enum: ['Draft', 'Published'] });
      const schema = createSchema({
        'def-1': {
          title: 'PostCreate',
          type: 'object',
          properties: { status: status() }
        },
        'def-2': {
          title: 'PostSingle',
          type: 'object',
          properties: { status: status() }
        }
      });

      expect(hoistSharedTypes(schema)).toEqual(['PostStatus']);
    });

    test('cuts the common name at a word boundary', () => {
      const state = () => ({ type: 'string', enum: ['up', 'down'] });
      const schema = createSchema({
        'def-1': {
          title: 'HealthCheckResponse',
          type: 'object',
          properties: { status: state() }
        },
        'def-2': {
          title: 'HealthCheckResult',
          type: 'object',
          properties: { status: state() }
        }
      });

      expect(hoistSharedTypes(schema)).toEqual(['HealthCheckStatus']);
    });

    test('keeps an enum declared only once inline', () => {
      const schema = createSchema({
        'def-1': {
          title: 'PostSingle',
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['Draft', 'Published'] }
          }
        }
      });

      expect(hoistSharedTypes(schema)).toEqual([]);
      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['def-1'].properties.status.enum).toEqual([
        'Draft',
        'Published'
      ]);
    });

    test('hoists enums that differ only in their documentation', () => {
      const schema = createSchema({
        'def-1': {
          title: 'PostCreate',
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['Draft'], description: 'Created' }
          }
        },
        'def-2': {
          title: 'PostSingle',
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['Draft'], description: 'Read' }
          }
        }
      });

      expect(hoistSharedTypes(schema)).toEqual(['PostStatus']);

      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['PostStatus']).toEqual({
        title: 'PostStatus',
        type: 'string',
        enum: ['Draft']
      });
      expect(schemas['def-1'].properties.status).toEqual({
        description: 'Created',
        $ref: '#/components/schemas/PostStatus'
      });
      expect(schemas['def-2'].properties.status).toEqual({
        description: 'Read',
        $ref: '#/components/schemas/PostStatus'
      });
    });

    test('keeps enums that differ in their structure inline', () => {
      const schema = createSchema({
        'def-1': {
          title: 'PostCreate',
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['Draft'] }
          }
        },
        'def-2': {
          title: 'PostSingle',
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['Draft'], nullable: true }
          }
        }
      });

      expect(hoistSharedTypes(schema)).toEqual([]);
    });

    test('keeps enums the declarations share no name for inline', () => {
      const flag = () => ({ type: 'string', enum: ['on', 'off'] });
      const schema = createSchema({
        'def-1': {
          title: 'PostCreate',
          type: 'object',
          properties: { state: flag() }
        },
        'def-2': {
          title: 'UserCreate',
          type: 'object',
          properties: { state: flag() }
        }
      });

      expect(hoistSharedTypes(schema)).toEqual([]);
    });

    test('keeps enums whose name is already taken inline', () => {
      const schema = createSchema({
        SortDirection: { title: 'SortDirection', type: 'object' },
        'def-1': {
          title: 'PostQuerySort',
          type: 'object',
          properties: { id: sortDirection(), title: sortDirection() }
        }
      });

      expect(hoistSharedTypes(schema)).toEqual([]);
    });

    test('hoists the enums nested below a definition', () => {
      const schema = createSchema({
        'def-1': {
          title: 'PostQueryRequest',
          type: 'object',
          properties: {
            sort: {
              type: 'object',
              properties: { id: sortDirection() }
            },
            filter: {
              type: 'array',
              items: {
                type: 'object',
                properties: { id: sortDirection() }
              }
            }
          }
        }
      });

      expect(hoistSharedTypes(schema)).toEqual(['SortDirection']);

      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['def-1'].properties.sort.properties.id).toEqual({
        example: 'desc',
        $ref: '#/components/schemas/SortDirection'
      });
      expect(schemas['def-1'].properties.filter.items.properties.id).toEqual({
        example: 'desc',
        $ref: '#/components/schemas/SortDirection'
      });
    });

    test('returns no names for a schema without definitions', () => {
      expect(hoistSharedTypes({ openapi: '3.0.3' } as OpenAPI3)).toEqual([]);
    });

    const scalar = () => ({
      anyOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'null' }
      ]
    });

    const filterValue = (description: string) => ({
      description,
      anyOf: [
        scalar(),
        { type: 'array', items: scalar() },
        { $ref: '#/components/schemas/def-2' }
      ]
    });

    const filterSchema = (extra: Record<string, unknown> = {}) =>
      createSchema({
        'def-1': {
          title: 'PostQueryFilter',
          type: 'object',
          properties: {
            id: filterValue('Filter by the record id'),
            title: filterValue('Filter by the title field'),
            ...extra
          }
        },
        'def-2': { title: 'QueryCondition', type: 'object' }
      });

    test('hoists the repeated filter value into a shared definition', () => {
      const schema = filterSchema();

      expect(hoistSharedTypes(schema)).toEqual([
        'QueryFilterValue',
        'QueryFilterScalar'
      ]);

      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['def-1'].properties).toEqual({
        id: {
          description: 'Filter by the record id',
          $ref: '#/components/schemas/QueryFilterValue'
        },
        title: {
          description: 'Filter by the title field',
          $ref: '#/components/schemas/QueryFilterValue'
        }
      });
    });

    test('hoists the plain values nested inside the shared filter value', () => {
      const schema = filterSchema();
      hoistSharedTypes(schema);

      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['QueryFilterValue']).toEqual({
        title: 'QueryFilterValue',
        anyOf: [
          { $ref: '#/components/schemas/QueryFilterScalar' },
          {
            type: 'array',
            items: { $ref: '#/components/schemas/QueryFilterScalar' }
          },
          { $ref: '#/components/schemas/def-2' }
        ]
      });
      expect(schemas['QueryFilterScalar']).toEqual({
        title: 'QueryFilterScalar',
        ...scalar()
      });
    });

    test('hoists the plain values of a relation filter, keeping its branches', () => {
      const schema = filterSchema({
        author: {
          description: 'Filter by the author relation',
          anyOf: [
            scalar(),
            { type: 'array', items: scalar() },
            { $ref: '#/components/schemas/def-3' },
            { type: 'array', items: { $ref: '#/components/schemas/def-3' } }
          ]
        }
      });

      hoistSharedTypes(schema);

      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['def-1'].properties.author).toEqual({
        description: 'Filter by the author relation',
        anyOf: [
          { $ref: '#/components/schemas/QueryFilterScalar' },
          {
            type: 'array',
            items: { $ref: '#/components/schemas/QueryFilterScalar' }
          },
          { $ref: '#/components/schemas/def-3' },
          { type: 'array', items: { $ref: '#/components/schemas/def-3' } }
        ]
      });
    });

    test('keeps a filter value declared only once inline', () => {
      const schema = createSchema({
        'def-1': {
          title: 'PostQueryFilter',
          type: 'object',
          properties: { id: filterValue('Filter by the record id') }
        },
        'def-2': { title: 'QueryCondition', type: 'object' }
      });

      // The plain values the single filter value is built from are still shared
      expect(hoistSharedTypes(schema)).toEqual(['QueryFilterScalar']);

      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['QueryFilterValue']).toBeUndefined();
      expect(schemas['def-1'].properties.id.anyOf).toEqual([
        { $ref: '#/components/schemas/QueryFilterScalar' },
        {
          type: 'array',
          items: { $ref: '#/components/schemas/QueryFilterScalar' }
        },
        { $ref: '#/components/schemas/def-2' }
      ]);
    });
  });
});
