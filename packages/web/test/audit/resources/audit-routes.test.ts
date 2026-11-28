import { resetContext } from '@appweaver/testing';

/** Imports the routes of the audit log with the given env, which their config reads when the module loads. */
async function load(env: Record<string, string>) {
  Object.assign(process.env, env);
  jest.resetModules();
  const { isResourceService, isResourcePolicy } =
    await import('@appweaver/common');
  const data = await import('@appweaver/data/resources');
  return {
    routes: await import('../../../audit/resources/audit-routes'),
    isResourceService,
    isResourcePolicy,
    data
  };
}

describe('audit-routes', () => {
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

  test('registers the read-only routes of the audit log for the roles of audit.routes', async () => {
    const { routes, data, isResourceService, isResourcePolicy } = await load({
      AUDIT_ENABLED: 'true',
      AUDIT_ROUTES_ENABLED: 'true',
      AUDIT_ROUTES_ROLES: 'Admin,Auditor'
    });

    expect(routes.auditLogRoutes?.basePath).toBe('audit-logs');
    expect(routes.auditChangeRoutes?.basePath).toBe('audit-changes');
    expect(routes.auditLogRoutes?.config).toMatchObject({
      modelName: 'AuditLog',
      defaults: { roles: ['Admin', 'Auditor'], audit: false },
      create: { exclude: true },
      update: { exclude: true },
      replace: { exclude: true },
      delete: { exclude: true },
      aggregate: { exclude: true },
      export: { exclude: true },
      bulkCreate: { exclude: true },
      bulkDelete: { exclude: true }
    });
    expect(isResourceService(data.auditLogService)).toBe(true);
    expect(isResourceService(data.auditChangeService)).toBe(true);

    const policy = data.auditLogPolicy as any;
    expect(isResourcePolicy(policy)).toBe(true);
    expect(policy.checkAccess(null, {}, 'query')).toBe(true);
    expect(policy.checkAccess(null, {}, 'find')).toBe(true);
    expect(policy.checkAccess(null, {}, 'create')).toBe(false);
    expect(policy.checkAccess(null, {}, 'update')).toBe(false);
    expect(policy.checkAccess(null, {}, 'delete')).toBe(false);
  });

  test('leaves the routes, the services and the policies out by default', async () => {
    const { routes, data } = await load({ AUDIT_ENABLED: 'true' });

    expect(routes.auditLogRoutes).toBeUndefined();
    expect(routes.auditChangeRoutes).toBeUndefined();
    expect(data.auditLogService).toBeUndefined();
    expect(data.auditChangePolicy).toBeUndefined();
  });

  test('leaves the routes out without the audit log', async () => {
    const { routes } = await load({ AUDIT_ROUTES_ENABLED: 'true' });

    expect(routes.auditLogRoutes).toBeUndefined();
  });

  test('serves the kept tables of a disabled audit log', async () => {
    const { routes } = await load({
      AUDIT_ROUTES_ENABLED: 'true',
      DATABASE_KEEP_TABLES: 'AuditLog'
    });

    expect(routes.auditLogRoutes?.basePath).toBe('audit-logs');
  });
});
