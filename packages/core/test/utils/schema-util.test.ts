import { Type } from '@sinclair/typebox';
import { MODEL } from '@appweaver/common';
import { context, injectAll } from '../../context';
import { createSchemaModel } from '../../utils/schema-util';
import { resetContext } from '../fixtures/context-fixture';

describe('schema-util', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('createSchemaModel', () => {
    test('registers the schema and returns a reference to it', () => {
      const schema = Type.Object({ id: Type.Integer() }, { $id: 'CustomData' });

      const reference: any = createSchemaModel(schema);

      expect(reference.$ref).toBe('CustomData');
      expect(injectAll(MODEL)).toEqual([{ name: 'CustomData', schema }]);
    });

    test('uses the explicit name over the schema id', () => {
      const schema = Type.Object({ id: Type.Integer() }, { $id: 'Ignored' });

      const reference: any = createSchemaModel(schema, { name: 'Explicit' });

      expect(reference.$ref).toBe('Explicit');
      expect(injectAll<any>(MODEL)[0].name).toBe('Explicit');
    });

    test('falls back to the schema title', () => {
      const schema = Type.Object({}, { title: 'TitleData' });

      expect((createSchemaModel(schema) as any).$ref).toBe('TitleData');
    });

    test('generates a name when the schema has neither id nor title', () => {
      const reference: any = createSchemaModel(Type.Object({}));

      expect(reference.$ref).toBe('Object0');
    });

    test('numbers the generated names by the registered models', () => {
      createSchemaModel(Type.Object({}));
      const second: any = createSchemaModel(Type.Object({}));

      expect(second.$ref).toBe('Object1');
    });

    test('returns a reference for every registration of the same name', () => {
      const first: any = createSchemaModel(Type.Object({}), {
        name: 'CustomData'
      });
      const second: any = createSchemaModel(Type.Object({}), {
        name: 'CustomData',
        skipExisting: false
      });

      expect(first.$ref).toBe('CustomData');
      expect(second.$ref).toBe('CustomData');
    });

    test('adds the schema to the server instance', () => {
      const addSchema = jest.fn();
      context.server = { addSchema } as any;

      createSchemaModel(Type.Object({ id: Type.Integer() }), {
        name: 'CustomData'
      });

      expect(addSchema).toHaveBeenCalledWith(
        expect.objectContaining({ $id: 'CustomData' })
      );
    });

    test('skips adding the schema to the server when disabled', () => {
      const addSchema = jest.fn();
      context.server = { addSchema } as any;

      createSchemaModel(Type.Object({}), {
        name: 'CustomData',
        addToServer: false
      });

      expect(addSchema).not.toHaveBeenCalled();
    });
  });
});
