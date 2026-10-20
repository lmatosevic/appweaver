import { Type } from '@sinclair/typebox';
import { TObject } from '@sinclair/typebox';
import { buildConfigSchema } from '../../config/config-schema';

/** A registered section with the given properties. */
const section = (path: string, properties: Record<string, any>) => ({
  section: path,
  prefix: '',
  schema: Type.Object(properties) as TObject,
  values: {}
});

describe('config-schema', () => {
  describe('buildConfigSchema', () => {
    test('nests the keys of each section by its path in camel case', () => {
      const schema = buildConfigSchema([
        section('storage.gcs', {
          BUCKET_NAME: Type.String({ default: 'files' })
        }),
        section('storage', { PATH: Type.String() })
      ]);

      expect(schema.definitions.config.properties.storage).toEqual({
        type: 'object',
        properties: {
          path: { type: 'string' },
          gcs: {
            type: 'object',
            properties: { bucketName: { type: 'string', default: 'files' } }
          }
        }
      });
    });

    test('drops the options only TypeBox reads', () => {
      const schema = buildConfigSchema([
        section('app', {
          ENV: Type.String({ default: 'prod', mapFrom: 'NODE_ENV' })
        })
      ]);

      expect(schema.definitions.config.properties.app.properties.env).toEqual({
        type: 'string',
        default: 'prod'
      });
    });

    test('references the config from the base and the environments', () => {
      const schema = buildConfigSchema([]);

      expect(schema.properties.config.$ref).toBe('#/definitions/config');
      expect(schema.properties.environments.additionalProperties.$ref).toBe(
        '#/definitions/config'
      );
    });
  });
});
