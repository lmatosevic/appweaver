import { resetContext } from '@appweaver/testing';

/** Imports the ApiKey model after an auth model, which gives the keys their scope relations. */
async function loadModel(): Promise<any> {
  process.env.SECURITY_API_KEY_ENABLED = 'true';
  jest.resetModules();
  const { createAuthModel } = await import('@appweaver/data');
  createAuthModel({ name: 'User' });
  return (await import('../../../../security/resources/api-key/model')).default;
}

describe('api-key model', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    jest.resetModules();
    resetContext();
  });

  test('accepts a key without a scope on create and replace', async () => {
    const model = await loadModel();

    for (const schema of [model.createOneModel, model.replaceOneModel]) {
      expect(Object.keys(schema.properties)).toEqual(
        expect.arrayContaining(['roles', 'permissions'])
      );
      expect(schema.required ?? []).not.toContain('roles');
      expect(schema.required ?? []).not.toContain('permissions');
    }
  });
});
