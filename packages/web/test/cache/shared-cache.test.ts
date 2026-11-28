import {
  ErrorCode,
  RESOURCE_POLICY_TYPE,
  RESOURCE_TYPE
} from '@appweaver/common';
import { define } from '@appweaver/core';
import { createModel } from '@appweaver/data';
import { linkModels, resetContext } from '@appweaver/testing';
import { assertSharedCache } from '../../cache/shared-cache';

const policy = (modelName: string, config: Record<string, unknown>) =>
  define(
    { modelName, ...config, [RESOURCE_TYPE]: RESOURCE_POLICY_TYPE } as never,
    modelName
  );

describe('shared-cache', () => {
  beforeEach(() => {
    resetContext();
    createModel({ name: 'Author', scalars: { name: { type: 'string' } } });
    createModel({ name: 'Secret', scalars: { name: { type: 'string' } } });
    createModel({
      name: 'Post',
      scalars: { title: { type: 'string' } },
      relations: {
        author: { model: 'Author', type: 'manyToOne', required: false },
        secret: {
          model: 'Secret',
          type: 'manyToOne',
          required: false,
          output: { type: 'none' }
        }
      }
    });
    linkModels();
  });

  afterAll(() => {
    resetContext();
  });

  describe('assertSharedCache', () => {
    test('accepts a model whose responses do not depend on the user', () => {
      policy('Secret', { readRestrictions: () => ({ id: 1 }) });

      expect(() => assertSharedCache('Post', 'query')).not.toThrow();
    });

    test.each([
      ['Post', 'readRestrictions'],
      ['Post', 'checkAccess'],
      ['Author', 'readRestrictions']
    ])(
      'refuses a policy of %s with %s, of the model or of one it includes',
      (model, callback) => {
        policy(model, { [callback]: () => true });

        expect(() => assertSharedCache('Post', 'query')).toThrow(
          expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
        );
      }
    );
  });
});
