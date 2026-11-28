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
    test('fails on a model, a policy or a service defined twice', () => {
      createModel({ name: 'Note', scalars: { text: { type: 'string' } } });
      createPolicy({ modelName: 'Note' });
      createService({ modelName: 'Note' });

      for (const define of [
        () => createModel({ name: 'Note' }),
        () => createPolicy({ modelName: 'Note' }),
        () => createService({ modelName: 'Note' })
      ]) {
        expect(define).toThrow(
          expect.objectContaining({ code: 'CONTEXT_DEFINITION_DUPLICATE' })
        );
      }
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
