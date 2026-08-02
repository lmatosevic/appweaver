import { Type } from '@sinclair/typebox';
import {
  countFieldName,
  defaultScalarValue,
  extractResourceName,
  extractSchemaProperties,
  isCountField,
  isResourceAuthModel,
  isResourceAuthService,
  isResourceModel,
  isResourcePolicy,
  isResourceRoutes,
  isResourceService,
  resourceModelProps
} from '../../utils/resource-util';
import {
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_ROUTES_TYPE,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE
} from '../../constants';
import { ScalarField } from '../../types';

describe('resource-util', () => {
  describe('resourceModelProps', () => {
    test('maps the model suffixes to the resource model properties', () => {
      expect(resourceModelProps['']).toBe('readModel');
      expect(resourceModelProps['Single']).toBe('readOneModel');
      expect(resourceModelProps['Multiple']).toBe('readManyModel');
      expect(resourceModelProps['Create']).toBe('createOneModel');
      expect(resourceModelProps['Update']).toBe('updateOneModel');
      expect(resourceModelProps['FileUpload']).toBe('fileUploadModel');
    });
  });

  describe('extractResourceName', () => {
    test('returns undefined without a schema', () => {
      expect(extractResourceName()).toBeUndefined();
      expect(extractResourceName(undefined)).toBeUndefined();
    });

    test('reads the resource name from an object schema', () => {
      const schema = Type.Object(
        { id: Type.String() },
        {
          [RESOURCE_NAME]: 'user'
        }
      );
      expect(extractResourceName(schema)).toBe('user');
    });

    test('reads the resource name from the items of an array schema', () => {
      const item = Type.Object(
        { id: Type.String() },
        {
          [RESOURCE_NAME]: 'post'
        }
      );
      expect(extractResourceName(Type.Array(item))).toBe('post');
    });

    test('returns undefined when the schema has no resource name', () => {
      expect(
        extractResourceName(Type.Object({ id: Type.String() }))
      ).toBeUndefined();
      expect(
        extractResourceName(Type.Array(Type.Object({ id: Type.String() })))
      ).toBeUndefined();
    });
  });

  describe('extractSchemaProperties', () => {
    const schema = Type.Object({
      id: Type.String(),
      title: Type.String({ maxLength: 100 })
    });

    test('returns undefined without a schema', () => {
      expect(extractSchemaProperties()).toBeUndefined();
    });

    test('returns all the properties when no key is given', () => {
      const properties = extractSchemaProperties(schema) as any;
      expect(Object.keys(properties)).toEqual(['id', 'title']);
    });

    test('returns a single property by key', () => {
      const field = extractSchemaProperties(schema, 'title') as any;
      expect(field.type).toBe('string');
      expect(field.maxLength).toBe(100);
    });

    test('returns undefined for an unknown key', () => {
      expect(extractSchemaProperties(schema, 'missing')).toBeUndefined();
    });

    test('resolves the properties behind a $ref', () => {
      const refSchema = {
        $ref: 'User',
        $defs: {
          User: { properties: { id: { type: 'string' } } }
        }
      } as any;
      expect(extractSchemaProperties(refSchema)).toEqual({
        id: { type: 'string' }
      });
      expect(extractSchemaProperties(refSchema, 'id')).toEqual({
        type: 'string'
      });
    });

    test('resolves a referenced definition inside anyOf', () => {
      const anyOfSchema = {
        properties: {
          author: { anyOf: [{ $ref: 'User' }, { type: 'null' }] }
        },
        $defs: {
          User: { type: 'object', properties: { id: { type: 'string' } } }
        }
      } as any;
      expect(extractSchemaProperties(anyOfSchema, 'author')).toEqual(
        anyOfSchema.$defs.User
      );
    });

    test('returns undefined when the anyOf entry has no reference', () => {
      const anyOfSchema = {
        properties: { author: { anyOf: [{ type: 'string' }] } }
      } as any;
      expect(extractSchemaProperties(anyOfSchema, 'author')).toBeUndefined();
    });
  });

  describe('countFieldName / isCountField', () => {
    test('appends the Count suffix', () => {
      expect(countFieldName('comments')).toBe('commentsCount');
    });

    test('detects a count field name', () => {
      expect(isCountField(countFieldName('comments'))).toBe(true);
      expect(isCountField('commentsCount')).toBe(true);
    });

    test('rejects names without the Count suffix', () => {
      expect(isCountField('comments')).toBe(false);
      expect(isCountField('countComments')).toBe(false);
      expect(isCountField('commentscount')).toBe(false);
    });
  });

  describe('resource type guards', () => {
    const model = { [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE };
    const authModel = {
      [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE,
      [RESOURCE_AUTH]: true
    };
    const routes = { [RESOURCE_TYPE]: RESOURCE_ROUTES_TYPE };
    const policy = { [RESOURCE_TYPE]: RESOURCE_POLICY_TYPE };
    const service = { [RESOURCE_TYPE]: RESOURCE_SERVICE_TYPE };

    class ServiceClass {
      static [RESOURCE_TYPE] = RESOURCE_SERVICE_TYPE;
    }

    class AuthServiceClass {
      static [RESOURCE_TYPE] = RESOURCE_SERVICE_TYPE;
      static [RESOURCE_AUTH] = true;
    }

    test('isResourceModel', () => {
      expect(isResourceModel(model)).toBe(true);
      expect(isResourceModel(authModel)).toBe(true);
      expect(isResourceModel(routes)).toBe(false);
      expect(isResourceModel({})).toBe(false);
      expect(isResourceModel('model')).toBe(false);
    });

    test('isResourceAuthModel', () => {
      expect(isResourceAuthModel(authModel)).toBe(true);
      expect(isResourceAuthModel(model)).toBeFalsy();
      expect(isResourceAuthModel(routes)).toBe(false);
    });

    test('isResourceService accepts objects and constructors', () => {
      expect(isResourceService(service)).toBe(true);
      expect(isResourceService(ServiceClass)).toBe(true);
      expect(isResourceService(model)).toBe(false);
      expect(isResourceService(() => undefined)).toBe(false);
    });

    test('isResourceAuthService', () => {
      expect(isResourceAuthService(AuthServiceClass)).toBe(true);
      expect(isResourceAuthService(ServiceClass)).toBeFalsy();
      expect(isResourceAuthService(model)).toBe(false);
    });

    test('isResourceRoutes', () => {
      expect(isResourceRoutes(routes)).toBe(true);
      expect(isResourceRoutes(model)).toBe(false);
    });

    test('isResourcePolicy', () => {
      expect(isResourcePolicy(policy)).toBe(true);
      expect(isResourcePolicy(routes)).toBe(false);
    });
  });

  describe('defaultScalarValue', () => {
    test('returns an empty array for array fields regardless of the type', () => {
      expect(defaultScalarValue({ type: 'string', array: true })).toEqual([]);
      expect(defaultScalarValue({ type: 'int', array: true })).toEqual([]);
    });

    test('returns an empty string for string fields', () => {
      expect(defaultScalarValue({ type: 'string' })).toBe('');
    });

    test('returns zero for numeric fields', () => {
      expect(defaultScalarValue({ type: 'int' })).toBe(0);
      expect(defaultScalarValue({ type: 'bigInt' })).toBe(0);
      expect(defaultScalarValue({ type: 'float' })).toBe(0);
    });

    test('returns false for boolean fields', () => {
      expect(defaultScalarValue({ type: 'boolean' })).toBe(false);
    });

    test('returns a date for dateTime fields', () => {
      expect(defaultScalarValue({ type: 'dateTime' })).toBeInstanceOf(Date);
    });

    test('returns an empty object for json fields', () => {
      expect(defaultScalarValue({ type: 'json' })).toEqual({});
    });

    test('returns the first value for enum fields', () => {
      expect(
        defaultScalarValue({
          type: 'enum',
          values: ['draft', 'published']
        })
      ).toBe('draft');
    });

    test('returns an empty string for an enum without values', () => {
      expect(defaultScalarValue({ type: 'enum', values: [] })).toBe('');
    });

    test('returns undefined for an unknown type', () => {
      expect(defaultScalarValue({ type: 'unknown' } as any)).toBeUndefined();
    });
  });
});
