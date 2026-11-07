import { resetContext } from '@appweaver/testing';

/** Imports the TwoFactorRecoveryCode model after an auth model, which links the codes to their user. */
async function loadModels(env: Record<string, string> = {}): Promise<any> {
  Object.assign(process.env, { SECURITY_ACCOUNT_2FA_ENABLED: 'true', ...env });
  jest.resetModules();
  const { createAuthModel } = await import('@appweaver/data');
  const authModel = createAuthModel({ name: 'User' });
  const model = (
    await import('../../../../security/resources/two-factor-recovery-code/model')
  ).default;
  return { authModel, model };
}

describe('two-factor-recovery-code model', () => {
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

  test('links the codes to the auth model, deleted with it', async () => {
    const { model } = await loadModels();

    expect(model.name).toBe('TwoFactorRecoveryCode');
    expect(model.config.relations.user).toMatchObject({
      model: 'User',
      mappedBy: 'twoFactorRecoveryCodes',
      onDelete: 'cascade'
    });
  });

  test('stores only the unique hash of a code, never in output', async () => {
    const { model } = await loadModels();

    expect(model.config.scalars.codeHash).toMatchObject({
      unique: true,
      hidden: true
    });
  });

  test('adds the codes relation to the auth model', async () => {
    const { authModel } = await loadModels();

    expect(authModel.config.relations.twoFactorRecoveryCodes).toMatchObject({
      model: 'TwoFactorRecoveryCode',
      input: { type: 'none' },
      output: { type: 'none' }
    });
  });

  test('is not created with 2FA disabled', async () => {
    const { authModel, model } = await loadModels({
      SECURITY_ACCOUNT_2FA_ENABLED: 'false'
    });

    expect(model).toBeUndefined();
    expect(authModel.config.relations).not.toHaveProperty(
      'twoFactorRecoveryCodes'
    );
  });
});
