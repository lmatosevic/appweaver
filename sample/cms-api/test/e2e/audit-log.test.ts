import { configOverrides } from '@appweaver/common';
import { Application, createApp, inject, injectService } from '@appweaver/core';
import { AuditService, hashPassword } from '@appweaver/data';
import { resetTestData } from './support/reset';

/**
 * Exercises the audit log against the real database: the requests are recorded
 * with their user, the changes of the records with their diffs, and the
 * entries are read through the routes of the admins.
 */
describe('Audit log', () => {
  const email = 'audit-log@example.com';
  const password = 'AuditLog!Pass1';
  let app: Application;
  let adminId: number;
  let auth: Record<string, string>;

  const request = async (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: any,
    headers: Record<string, string> = auth
  ) => {
    const response = await app.server.inject({ method, url, payload, headers });
    return { status: response.statusCode, body: response.json() };
  };

  /** Writes the buffered entries, which the service otherwise writes every second. */
  const flush = () => inject(AuditService).flush();

  beforeAll(async () => {
    // The login route would otherwise verify a reCAPTCHA token with Google
    configOverrides.SECURITY_RECAPTCHA_ENABLED = false;
    app = await createApp();
    const admin = await injectService('User').client.create({
      data: {
        firstName: 'Audit',
        lastName: 'Admin',
        email,
        passwordHash: await hashPassword(password),
        roles: {
          connectOrCreate: {
            where: { name: 'Admin' },
            create: { name: 'Admin' }
          }
        }
      }
    });
    adminId = admin.id;
    const login = await app.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: email, password }
    });
    auth = { authorization: `Bearer ${login.json().accessToken}` };
  }, 30_000);

  afterAll(async () => {
    await app.stop();
    delete configOverrides.SECURITY_RECAPTCHA_ENABLED;
  });

  afterAll(resetTestData, 10_000);

  test('records a failed login as anonymous, without the password', async () => {
    const login = await request(
      'POST',
      '/auth/login',
      { username: email, password: 'Wrong!Pass1' },
      {}
    );
    await flush();

    expect(login.status).toBe(401);
    const { body } = await request('POST', '/api/audit-logs/query', {
      filter: { action: 'auth.login', status: 401 }
    });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      category: 'auth',
      source: 'http',
      method: 'POST',
      route: '/auth/login'
    });
    expect(body.items[0].userId).toBeFalsy();
    expect(body.items[0].body).toBeFalsy();
  });

  test('keeps the history of a record, each change with its request', async () => {
    const created = await request('POST', '/api/tags', {
      name: 'Audit',
      slug: 'audit'
    });
    const updated = await request('PATCH', `/api/tags/${created.body.id}`, {
      name: 'Audited'
    });
    await flush();

    expect(updated.status).toBe(200);
    const { body } = await request('POST', '/api/audit-changes/query', {
      filter: { model: 'Tag', resourceId: String(created.body.id) },
      sort: 'createdAt'
    });
    expect(body.items).toEqual([
      expect.objectContaining({
        action: 'create',
        diff: {
          name: { to: 'Audit' },
          slug: { to: 'audit' },
          createdById: { to: adminId }
        },
        auditLog: expect.objectContaining({
          category: 'write',
          action: 'create',
          userId: String(adminId),
          status: 201
        })
      }),
      expect.objectContaining({
        action: 'update',
        diff: { name: { from: 'Audit', to: 'Audited' } },
        auditLog: expect.objectContaining({
          action: 'update',
          route: '/api/tags/:id',
          resourceId: String(created.body.id)
        })
      })
    ]);
  });

  test('finds an entry with its changes', async () => {
    const created = await request('POST', '/api/tags', {
      name: 'Found',
      slug: 'found'
    });
    await flush();
    const { body: logs } = await request('POST', '/api/audit-logs/query', {
      filter: { model: 'Tag', resourceId: String(created.body.id) }
    });

    const { status, body } = await request(
      'GET',
      `/api/audit-logs/${logs.items[0].id}`
    );

    expect(status).toBe(200);
    expect(body.changes).toEqual([
      expect.objectContaining({ model: 'Tag', action: 'create' })
    ]);
  });

  test('leaves the audit log to the admins', async () => {
    const { status } = await request('POST', '/api/audit-logs/query', {}, {});

    expect(status).toBe(401);
  });
});
