import { context } from '@appweaver/core/internal';
import { resetContext } from '@appweaver/testing';
import { createModel } from '../../factory/create-model';
import { createPolicy } from '../../factory/create-policy';
import { createService } from '../../factory/create-service';
import { loadResources } from '../../resource/resource-loader';

const NO_FILES = {
  modelPattern: 'none/*.ts',
  servicePattern: 'none/*.ts',
  policyPattern: 'none/*.ts'
};

describe('resource-loader', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('loadResources', () => {
    test('loads the definitions the context holds when a name is defined twice', async () => {
      const first = createModel({
        name: 'Note',
        scalars: { text: { type: 'string' }, color: { type: 'string' } }
      });
      const second = createModel({
        name: 'Note',
        scalars: { text: { type: 'string' } }
      });
      const firstPolicy = createPolicy({ modelName: 'Note' });
      const secondPolicy = createPolicy({ modelName: 'Note' });
      const firstService = createService({ modelName: 'Note' });
      const secondService = createService({ modelName: 'Note' });

      const loaded = await loadResources(__dirname, NO_FILES, [
        async () => ({ first, firstPolicy, firstService }),
        async () => ({ second, secondPolicy, secondService })
      ]);

      expect(context.resource.models.get('Note')).toBe(first);
      expect(loaded.models.get('Note')).toBe(first);
      expect(loaded.policies.get('Note')).toBe(firstPolicy);
      expect(loaded.services.get('Note')).toBe(firstService);
      // The model the context uses is the one linked into the schema module
      expect(first.readOneModel).toHaveProperty('$ref');
      expect(second.readOneModel).not.toHaveProperty('$ref');
    });

    test('loads the model defined with override', async () => {
      const first = createModel({
        name: 'Note',
        scalars: { text: { type: 'string' } }
      });
      const override = createModel(
        { name: 'Note', scalars: { body: { type: 'string' } } },
        true
      );

      const loaded = await loadResources(__dirname, NO_FILES, [
        async () => ({ first }),
        async () => ({ override })
      ]);

      expect(loaded.models.get('Note')).toBe(override);
    });
  });
});
