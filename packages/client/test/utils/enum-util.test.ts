import { OpenAPI3 } from 'openapi-typescript';
import { hoistSharedEnums } from '../../utils/enum-util';

describe('enum-util', () => {
  describe('hoistSharedEnums', () => {
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

      expect(hoistSharedEnums(schema)).toEqual(['SortDirection']);

      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['SortDirection']).toEqual({
        title: 'SortDirection',
        ...sortDirection()
      });
      expect(schemas['def-1'].properties).toEqual({
        id: { $ref: '#/components/schemas/SortDirection' },
        title: { $ref: '#/components/schemas/SortDirection' }
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

      expect(hoistSharedEnums(schema)).toEqual(['PostStatus']);
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

      expect(hoistSharedEnums(schema)).toEqual(['HealthCheckStatus']);
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

      expect(hoistSharedEnums(schema)).toEqual([]);
      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['def-1'].properties.status.enum).toEqual([
        'Draft',
        'Published'
      ]);
    });

    test('keeps enums that differ in anything but their values inline', () => {
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

      expect(hoistSharedEnums(schema)).toEqual([]);
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

      expect(hoistSharedEnums(schema)).toEqual([]);
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

      expect(hoistSharedEnums(schema)).toEqual([]);
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

      expect(hoistSharedEnums(schema)).toEqual(['SortDirection']);

      const schemas = schema.components!.schemas as Record<string, any>;
      expect(schemas['def-1'].properties.sort.properties.id).toEqual({
        $ref: '#/components/schemas/SortDirection'
      });
      expect(schemas['def-1'].properties.filter.items.properties.id).toEqual({
        $ref: '#/components/schemas/SortDirection'
      });
    });

    test('returns no names for a schema without definitions', () => {
      expect(hoistSharedEnums({ openapi: '3.0.3' } as OpenAPI3)).toEqual([]);
    });
  });
});
