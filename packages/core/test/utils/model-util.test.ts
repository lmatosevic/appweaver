import { ResourceModel, ScalarField, VirtualField } from '@appweaver/common';
import { context } from '../../context';
import {
  isSoftDeleteModel,
  liveRecordFilter,
  validateScalarDefaults,
  validateSoftDeleteCascades
} from '../../utils/model-util';
import { resetContext } from '../fixtures/context-fixture';

function models(
  scalars: Record<string, ScalarField>,
  virtual: Record<string, VirtualField> = {}
): Record<string, ResourceModel> {
  return {
    Post: { name: 'Post', config: { scalars, virtual } }
  } as unknown as Record<string, ResourceModel>;
}

const validate = (
  scalars: Record<string, ScalarField>,
  virtual?: Record<string, VirtualField>
) => validateScalarDefaults(models(scalars, virtual));

describe('model-util', () => {
  describe('validateScalarDefaults', () => {
    test('accepts fields without a default value', () => {
      expect(() =>
        validate({ title: { type: 'string', minLength: 5 } })
      ).not.toThrow();
    });

    test('accepts defaults inside their own constraints', () => {
      expect(() =>
        validate({
          title: { type: 'string', minLength: 1, maxLength: 10, default: 'ok' },
          slug: { type: 'string', pattern: '^[a-z]+$', default: 'slug' },
          counter: { type: 'int', minimum: 0, maximum: 10, default: 0 },
          rating: { type: 'float', minimum: 0, default: 1.5 },
          enabled: { type: 'boolean', default: true },
          publishedAt: { type: 'dateTime', default: '2026-01-01T00:00:00Z' },
          status: { type: 'enum', values: ['Draft'], default: 'Draft' },
          metadata: { type: 'json', default: { any: 'value' } }
        })
      ).not.toThrow();
    });

    test('rejects a numeric default below the minimum', () => {
      expect(() =>
        validate({ counter: { type: 'int', minimum: 1, default: 0 } })
      ).toThrow(
        /'Post.counter' has a default value of 0, which violates its own minimum of 1/
      );
    });

    test('rejects a numeric default above the maximum', () => {
      expect(() =>
        validate({ counter: { type: 'int', maximum: 10, default: 11 } })
      ).toThrow(/violates its own maximum of 10/);
    });

    test('rejects a string default outside the length constraints', () => {
      expect(() =>
        validate({ title: { type: 'string', minLength: 3, default: 'ab' } })
      ).toThrow(/violates its own minLength of 3/);

      expect(() =>
        validate({ title: { type: 'string', maxLength: 2, default: 'abc' } })
      ).toThrow(/violates its own maxLength of 2/);
    });

    test('rejects a string default not matching the pattern', () => {
      expect(() =>
        validate({
          slug: { type: 'string', pattern: '^[a-z]+$', default: 'Not A Slug' }
        })
      ).toThrow(/violates its own pattern of "\^\[a-z\]\+\$"/);
    });

    test('skips a pattern that is not a valid regular expression', () => {
      expect(() =>
        validate({ slug: { type: 'string', pattern: '[', default: 'x' } })
      ).not.toThrow();
    });

    test('rejects an enum default outside the allowed values', () => {
      expect(() =>
        validate({
          status: { type: 'enum', values: ['Draft', 'Live'], default: 'Gone' }
        })
      ).toThrow(/violates its own allowed values of \["Draft","Live"\]/);
    });

    test('rejects a default of the wrong type', () => {
      expect(() =>
        validate({ title: { type: 'string', default: 1 as any } })
      ).toThrow(/which is not a string/);

      expect(() =>
        validate({ counter: { type: 'int', default: 'one' as any } })
      ).toThrow(/which is not a number/);

      expect(() =>
        validate({ counter: { type: 'int', default: 1.5 } })
      ).toThrow(/which is not an integer/);

      expect(() =>
        validate({ enabled: { type: 'boolean', default: 'yes' as any } })
      ).toThrow(/which is not a boolean/);

      expect(() =>
        validate({ publishedAt: { type: 'dateTime', default: 'nope' } })
      ).toThrow(/which is not a valid date/);
    });

    test('accepts a float default for a float field', () => {
      expect(() =>
        validate({ rating: { type: 'float', default: 1.5 } })
      ).not.toThrow();
    });

    test('validates every item of an array default', () => {
      expect(() =>
        validate({
          tags: { type: 'string', array: true, maxLength: 3, default: ['ok'] }
        })
      ).not.toThrow();

      expect(() =>
        validate({
          tags: {
            type: 'string',
            array: true,
            maxLength: 3,
            default: ['ok', 'too long']
          }
        })
      ).toThrow(/violates its own maxLength of 3/);
    });

    test('validates the defaults of the virtual fields', () => {
      expect(() =>
        validate({}, { score: { type: 'int', minimum: 1, default: 0 } })
      ).toThrow(/'Post.score' has a default value of 0/);
    });

    test('reports every invalid default at once', () => {
      let message = '';
      try {
        validate({
          counter: { type: 'int', minimum: 1, default: 0 },
          title: { type: 'string', maxLength: 1, default: 'long' }
        });
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain("'Post.counter'");
      expect(message).toContain("'Post.title'");
    });
  });

  describe('isSoftDeleteModel', () => {
    beforeEach(() => {
      resetContext();
      context.resource.models.set('Post', {
        name: 'Post',
        config: { name: 'Post', softDelete: true }
      } as unknown as ResourceModel);
      context.resource.models.set('Tag', {
        name: 'Tag',
        config: { name: 'Tag' }
      } as unknown as ResourceModel);
    });

    afterAll(() => {
      resetContext();
    });

    test('detects a model with soft delete enabled', () => {
      expect(isSoftDeleteModel('Post')).toBe(true);
      expect(isSoftDeleteModel('post')).toBe(true);
    });

    test('returns false for other and unknown models', () => {
      expect(isSoftDeleteModel('Tag')).toBe(false);
      expect(isSoftDeleteModel('Missing')).toBe(false);
      expect(isSoftDeleteModel()).toBe(false);
    });
  });

  describe('liveRecordFilter', () => {
    beforeEach(() => {
      resetContext();
      context.resource.models.set('Post', {
        name: 'Post',
        config: { name: 'Post', softDelete: true }
      } as unknown as ResourceModel);
    });

    afterAll(() => {
      resetContext();
    });

    test('matches the records that are not soft deleted', () => {
      expect(liveRecordFilter('Post')).toEqual({ deletedAt: null });
    });

    test('returns no condition for a model without soft delete', () => {
      expect(liveRecordFilter('Missing')).toEqual({});
    });
  });

  describe('validateSoftDeleteCascades', () => {
    const cascadeModels = (commentSoftDelete: boolean) =>
      ({
        Post: { name: 'Post', config: { name: 'Post', softDelete: true } },
        Comment: {
          name: 'Comment',
          config: {
            name: 'Comment',
            softDelete: commentSoftDelete,
            relations: {
              post: {
                model: 'Post',
                type: 'oneToMany',
                owner: true,
                onDelete: 'cascade'
              }
            }
          }
        }
      }) as unknown as Record<string, ResourceModel>;

    test('accepts a cascade into a soft deleted model', () => {
      expect(() =>
        validateSoftDeleteCascades(cascadeModels(true))
      ).not.toThrow();
    });

    test('rejects a cascade into a model without soft delete', () => {
      expect(() => validateSoftDeleteCascades(cascadeModels(false))).toThrow(
        /Invalid resource model soft delete cascades:\n {2}- Model 'Comment' must enable 'softDelete'/
      );
    });
  });
});
