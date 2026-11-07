import { resetContext } from '@appweaver/testing';

/** Imports the TwoFactorMethod model after an auth model, which links the methods to their user. */
async function loadModels(env: Record<string, string> = {}): Promise<any> {
  Object.assign(process.env, env);
  jest.resetModules();
  const { createAuthModel } = await import('@appweaver/data');
  const authModel = createAuthModel({ name: 'User' });
  const model = (
    await import('../../../../security/resources/two-factor-method/model')
  ).default;
  return { authModel, model };
}

describe('two-factor-method model', () => {
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

  test('links the methods to the auth model, one of each type', async () => {
    const { model } = await loadModels();

    expect(model.name).toBe('TwoFactorMethod');
    expect(model.config.relations.user).toMatchObject({
      model: 'User',
      // A manyToOne relation is stored as the oneToMany relation owning the key
      type: 'oneToMany',
      owner: true,
      mappedBy: 'twoFactorMethods',
      onDelete: 'cascade'
    });
    expect(model.config.unique).toEqual([['userId', 'type']]);
  });

  test('never outputs the secret and the last used step', async () => {
    const { model } = await loadModels();

    expect(model.config.scalars.secret.hidden).toBe(true);
    expect(model.config.scalars.lastUsedStep.hidden).toBe(true);
  });

  test('adds the methods relation and the phone fields to the auth model', async () => {
    const { authModel } = await loadModels();

    expect(authModel.config.relations.twoFactorMethods).toMatchObject({
      model: 'TwoFactorMethod',
      type: 'oneToMany',
      input: { type: 'none' },
      output: { type: 'none' }
    });
    expect(authModel.config.scalars.phoneNumber).toMatchObject({
      type: 'string',
      required: false
    });
    expect(authModel.config.scalars.verifiedPhone).toMatchObject({
      type: 'boolean',
      default: false
    });
    expect(authModel.config.scalars).not.toHaveProperty('twoFactorAuth');
  });

  test('accepts no phone fields as input of the auth model', async () => {
    const { authModel } = await loadModels();

    expect(authModel.config.create.omit).toEqual(
      expect.arrayContaining(['phoneNumber', 'verifiedPhone'])
    );
    expect(authModel.config.update.omit).toEqual(
      expect.arrayContaining(['phoneNumber', 'verifiedPhone'])
    );
  });

  test('is not created with 2FA disabled', async () => {
    const { authModel, model } = await loadModels({
      SECURITY_ACCOUNT_2FA_ENABLED: 'false'
    });

    expect(model).toBeUndefined();
    expect(authModel.config.relations).not.toHaveProperty('twoFactorMethods');
  });
});
