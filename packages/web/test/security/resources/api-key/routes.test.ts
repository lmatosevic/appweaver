import { resetContext } from '@appweaver/testing';

/** Imports the routes of the API keys with the given env, which their config reads when the module loads. */
async function loadRoutes(env: Record<string, string>): Promise<any> {
  Object.assign(process.env, env);
  jest.resetModules();
  return (await import('../../../../security/resources/api-key/routes'))
    .default;
}

describe('api-key routes', () => {
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

  test('registers the routes of the API keys for a JWT session only', async () => {
    const routes = await loadRoutes({ SECURITY_API_KEY_ENABLED: 'true' });

    expect(routes.basePath).toBe('api-keys');
    expect(routes.config).toMatchObject({
      modelName: 'ApiKey',
      defaults: { auth: ['jwt'] },
      aggregate: { exclude: true },
      export: { exclude: true }
    });
  });

  test('leaves the routes out with routesEnabled off', async () => {
    const routes = await loadRoutes({
      SECURITY_API_KEY_ENABLED: 'true',
      SECURITY_API_KEY_ROUTES_ENABLED: 'false'
    });

    expect(routes).toBeUndefined();
  });

  test('leaves the routes out without API keys', async () => {
    const routes = await loadRoutes({});

    expect(routes).toBeUndefined();
  });
});
