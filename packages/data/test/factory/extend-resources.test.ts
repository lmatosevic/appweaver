import { Value } from '@sinclair/typebox/value';
import { ErrorCode } from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { resetContext } from '@appweaver/testing';
import { createModel } from '../../factory/create-model';
import { createPolicy } from '../../factory/create-policy';
import { createService } from '../../factory/create-service';
import {
  extendModel,
  extendPolicy,
  extendService
} from '../../factory/extend-resources';
import { loadResources } from '../../resource/resource-loader';

const NO_FILES = {
  modelPattern: 'none/*.ts',
  servicePattern: 'none/*.ts',
  policyPattern: 'none/*.ts'
};

const user = { id: 1, email: 'user@test.com', roles: [] };

/** Loads the given exports the way the framework loads the resources of a module after the ones of the app. */
const load = (exports: Record<string, unknown>) =>
  loadResources(__dirname, NO_FILES, [async () => exports]);

describe('extend-resources', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('extendModel', () => {
    test('adds fields and indexes and overrides the options of a model loaded after it', async () => {
      // The application's extension is declared before the module model is created
      const mark = extendModel('Key', {
        scalars: {
          label: { type: 'string', required: false },
          name: { maxLength: 10 } as never
        },
        index: ['label'],
        read: { omit: ['secret'] as never }
      });
      const model = createModel({
        name: 'Key',
        scalars: {
          name: { type: 'string', maxLength: 255 },
          secret: { type: 'string' }
        },
        index: ['name']
      });

      await load({ model, mark });

      expect(context.resource.models.get('Key')).toBe(model);
      expect(model.config.scalars).toMatchObject({
        label: { type: 'string', required: false },
        name: { type: 'string', maxLength: 10 }
      });
      expect(model.config.index).toEqual(['name', 'label']);
      expect(model.config.read).toEqual({ omit: ['secret'] });
      expect(
        Value.Check(model.createModel, { name: 'Ab', label: 'x', secret: 's' })
      ).toBe(true);
      expect(
        Value.Check(model.createModel, { name: 'A'.repeat(11), secret: 's' })
      ).toBe(false);
    });

    test('merges every extension of a model in order', async () => {
      extendModel('Key', { scalars: { a: { type: 'int', default: 1 } } });
      extendModel('Key', { scalars: { a: { default: 2 } as never } });
      const model = createModel({ name: 'Key' });

      await load({ model });

      expect(model.config.scalars?.a).toEqual({ type: 'int', default: 2 });
    });

    test('refuses a required field or a field changing its type', async () => {
      extendModel('Key', { scalars: { label: { type: 'string' } } });
      const model = createModel({ name: 'Key' });

      await expect(load({ model })).rejects.toMatchObject({
        code: ErrorCode.ConfigurationInvalid,
        message: expect.stringContaining("adds the required field 'label'")
      });

      resetContext();
      extendModel('Key', { scalars: { name: { type: 'int' } } });
      const other = createModel({
        name: 'Key',
        scalars: { name: { type: 'string' } }
      });

      await expect(load({ other })).rejects.toMatchObject({
        code: ErrorCode.ConfigurationInvalid,
        message: expect.stringContaining(
          "cannot change the type of the field 'name'"
        )
      });
    });

    test('accepts an optional relation and a list relation', async () => {
      createModel({ name: 'Tag' });
      extendModel('Key', {
        relations: {
          tag: { model: 'Tag', type: 'manyToOne', required: false },
          tags: { model: 'Tag', type: 'manyToMany' }
        }
      });
      const model = createModel({ name: 'Key' });

      await expect(load({ model })).resolves.toBeDefined();
      expect(Object.keys(model.config.relations ?? {})).toEqual([
        'tag',
        'tags'
      ]);
    });

    test('warns about an extension of a model the application does not have', async () => {
      extendModel('Missing', { scalars: { a: { type: 'int', default: 1 } } });

      await expect(load({})).resolves.toBeDefined();
    });
  });

  describe('extendService', () => {
    test('runs the hooks of the extension after the ones of the service', async () => {
      const calls: string[] = [];
      const model = createModel({ name: 'Key' });
      extendService('Key', {
        beforeCreate: () => {
          calls.push('extension');
        }
      });
      const Service = createService({
        modelName: 'Key',
        beforeCreate: () => {
          calls.push('service');
        }
      });

      await load({ model, Service });
      const config = (context.resource.services.get('Key') as any)[
        Symbol.for('appweaver.Config')
      ];
      await config.beforeCreate({});

      expect(calls).toEqual(['service', 'extension']);
    });

    test('creates the service of a model without one', async () => {
      const model = createModel({ name: 'Key' });
      const afterCreate = jest.fn();
      extendService('Key', { afterCreate });

      await load({ model });

      expect(context.resource.services.get('Key')).toBeDefined();
    });
  });

  describe('extendPolicy', () => {
    test('requires both policies to allow, and keeps the write restrictions of the extended one', async () => {
      const model = createModel({ name: 'Key' });
      const policy = createPolicy({
        modelName: 'Key',
        checkAccess: (u) => !!u,
        readRestrictions: () => ({ ownerId: 1 }),
        writeRestrictions: () => ({ ownerId: 1 })
      });
      extendPolicy('Key', {
        checkAccess: (_u, resource: any) => resource.active,
        readRestrictions: () => ({ active: true }),
        writeRestrictions: () => ({ ownerId: 2, label: 'x' })
      });

      await load({ model, policy });
      const composed = context.resource.policies.get('Key')!;

      await expect(
        composed.checkAccess!(user, { active: true }, 'find')
      ).resolves.toBe(true);
      await expect(
        composed.checkAccess!(user, { active: false }, 'find')
      ).resolves.toBe(false);
      await expect(
        composed.checkAccess!(null, { active: true }, 'find')
      ).resolves.toBe(false);
      await expect(
        composed.readRestrictions!(user, 1, 'find')
      ).resolves.toEqual({ AND: [{ ownerId: 1 }, { active: true }] });
      await expect(
        composed.writeRestrictions!(user, {}, 'create')
      ).resolves.toEqual({ ownerId: 1, label: 'x' });
    });

    test('is the policy of a model without one', async () => {
      const model = createModel({ name: 'Key' });
      const checkAccess = jest.fn(() => false);
      extendPolicy('Key', { checkAccess });

      await load({ model });

      expect(context.resource.policies.get('Key')?.checkAccess).toBe(
        checkAccess
      );
    });
  });
});
