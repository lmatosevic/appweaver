import { resetContext } from './fixtures/context-fixture';

/**
 * The barrel is what `loadResources` and the `weaver generate` CLI pull in as `@appweaver/core/resources`, so anything
 * missing from it silently disappears from downstream applications.
 */
describe('core resources barrel', () => {
  const originalEnv = { ...process.env };

  let modelNames: string[];
  let serviceNames: string[];

  beforeAll(async () => {
    // Every conditional resource is switched on, so the barrel exposes its full surface
    Object.assign(process.env, {
      SECURITY_API_KEY_ENABLED: 'true',
      SECURITY_STORE_KEEP_DATABASE_TABLE: 'true',
      SECURITY_OAUTH2_GOOGLE_ENABLED: 'true'
    });
    jest.resetModules();

    // The resource markers are module-local symbols, so the predicates have to come from the same reloaded graph
    const { isResourceModel, isResourceService, RESOURCE_NAME } =
      await import('@appweaver/common');
    const resources = await import('../resources');

    const exported = Object.values(resources);

    modelNames = exported.filter(isResourceModel).map((model) => model.name);
    serviceNames = exported
      .filter(isResourceService)
      .map((service) => service[RESOURCE_NAME]);
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    jest.resetModules();
    resetContext();
  });

  test('should export every framework model', () => {
    expect(modelNames.sort()).toEqual([
      'ApiKey',
      'ConnectedAccount',
      'File',
      'OneTimeToken',
      'Permission',
      'Role',
      'Seeder'
    ]);
  });

  test('should export a service for every model the framework writes to itself', () => {
    // Without a service registered under the model name `injectService` finds nothing and the writes silently no-op
    expect(serviceNames).toContain('ApiKey');
    expect(serviceNames).toContain('ConnectedAccount');
  });
});
