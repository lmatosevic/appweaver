/** Loads the API key service with API keys enabled, along with the modules it reads its hooks with. */
async function loadService() {
  process.env.SECURITY_API_KEY_ENABLED = 'true';
  jest.resetModules();

  // The markers and the contexts are module-local, so they come from the same reloaded graph
  const common = await import('@appweaver/common');
  const core = await import('@appweaver/core');
  const { context } = await import('@appweaver/core/internal');
  context.resource.models.set('User', {
    name: 'User',
    [common.RESOURCE_TYPE]: common.RESOURCE_MODEL_TYPE,
    [common.RESOURCE_AUTH]: true
  } as any);

  const Service = (
    await import('../../../../security/resources/api-key/service')
  ).default as any;
  return { hooks: Service[common.CONFIG], runAs: core.runAs, context };
}

const owner = {
  id: 7,
  email: 'owner@test.com',
  roles: [{ id: 2, name: 'Editor', permissions: [{ id: 20, name: 'read' }] }]
} as any;

describe('api-key service', () => {
  const originalEnv = { ...process.env };

  afterAll(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('beforeCreate', () => {
    test('creates a key with a scope its owner holds', async () => {
      const { hooks, runAs } = await loadService();
      const data: any = { roles: [2], permissions: [{ id: 20 }] };

      await runAs(owner, () => hooks.beforeCreate(data));

      expect(data.key).toHaveLength(64);
      expect(data.user).toEqual({ id: 7 });
    });

    test('generates a key of letters and digits only', async () => {
      const { hooks, runAs } = await loadService();

      for (let i = 0; i < 20; i++) {
        const data: any = {};
        await runAs(owner, () => hooks.beforeCreate(data));
        expect(data.key).toMatch(/^[A-Za-z0-9]{64}$/);
      }
    });

    test('rejects a scope its owner does not hold', async () => {
      const { hooks, runAs } = await loadService();

      expect(() =>
        runAs(owner, () => hooks.beforeCreate({ roles: [1], permissions: [] }))
      ).toThrow(
        expect.objectContaining({
          code: 'AUTH_API_KEY_PERMISSION_DENIED',
          details: { roles: ['1'], permissions: [] }
        })
      );
    });
  });

  describe('beforeUpdate', () => {
    test('rejects a permission its owner does not hold', async () => {
      const { hooks, runAs } = await loadService();

      expect(() =>
        runAs(owner, () => hooks.beforeUpdate(5, { permissions: [21] }))
      ).toThrow(
        expect.objectContaining({ code: 'AUTH_API_KEY_PERMISSION_DENIED' })
      );
    });

    test('leaves an update without a user unchecked', async () => {
      const { hooks } = await loadService();

      expect(() => hooks.beforeUpdate(5, { permissions: [21] })).not.toThrow();
    });
  });

  describe('afterCreate', () => {
    test('stores the key masked, and returns it whole with its id', async () => {
      const { hooks, context } = await loadService();
      const update = jest.fn(async () => ({}));
      context.resource.services.set('ApiKey', { update } as any);
      const secret = 'abcd' + 'x'.repeat(56) + 'wxyz';
      const data: any = { id: 42, key: secret };

      await hooks.afterCreate(data);

      expect(update).toHaveBeenCalledWith(42, { key: 'abcd...wxyz' });
      expect(data.key).toBe(`42AK${secret}`);
    });
  });
});
