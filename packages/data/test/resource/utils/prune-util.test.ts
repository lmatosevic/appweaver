import {
  configOverrides,
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_TYPE,
  ResourceModel
} from '@appweaver/common';
import { pruneUnusedModels } from '../../../resource/utils/prune-util';

/** Creates a resource model with the given config. */
const model = (name: string, config: object = {}, auth = false) =>
  ({
    name,
    config,
    [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE,
    ...(auth ? { [RESOURCE_AUTH]: true } : {})
  }) as unknown as ResourceModel;

/** The framework models, with the given application models. */
const withFrameworkModels = (...models: ResourceModel[]) =>
  Object.fromEntries(
    [
      model('Role'),
      model('Permission'),
      model('ApiKey'),
      model('OneTimeToken'),
      model('File'),
      model('Seeder'),
      ...models
    ].map((entry) => [entry.name, entry])
  );

describe('prune-util', () => {
  afterEach(() => {
    delete configOverrides.DATABASE_SEEDERS_DIR_PATH;
  });

  describe('pruneUnusedModels', () => {
    test('keeps the models of an application using them', () => {
      configOverrides.DATABASE_SEEDERS_DIR_PATH = __dirname;
      const models = withFrameworkModels(
        model('User', {}, true),
        model('Post', { files: { cover: {} } })
      );

      expect(pruneUnusedModels(models)).toEqual([]);
      expect(Object.keys(models)).toContain('File');
    });

    test('removes the auth data model without an auth model', () => {
      const models = withFrameworkModels(model('Reading'));

      const removed = pruneUnusedModels(models);

      expect(removed).toEqual(
        expect.arrayContaining(['Role', 'Permission', 'ApiKey', 'OneTimeToken'])
      );
      expect(models).not.toHaveProperty('Role');
    });

    test('removes the File model without a model declaring files', () => {
      const models = withFrameworkModels(model('User', {}, true));

      expect(pruneUnusedModels(models)).toContain('File');
    });

    test('removes the Seeder model without a seeders directory', () => {
      configOverrides.DATABASE_SEEDERS_DIR_PATH = './missing/seeders';
      const models = withFrameworkModels(model('User', {}, true));

      expect(pruneUnusedModels(models)).toContain('Seeder');
    });

    test('keeps the Seeder model for the seeders of a module', () => {
      configOverrides.DATABASE_SEEDERS_DIR_PATH = './missing/seeders';
      const models = withFrameworkModels(model('User', {}, true));

      expect(pruneUnusedModels(models, ['/billing/seeders'])).not.toContain(
        'Seeder'
      );
    });
  });
});
