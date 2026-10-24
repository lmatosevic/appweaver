import { Events } from '@appweaver/common';
import { Application, createApp, inject, injectService } from '@appweaver/core';
import { hashPassword } from '@appweaver/data';
import { resetTestData } from './support/reset';

/**
 * Exercises the bulk routes of the Tag resource against the real database:
 * every item of a request is applied in a single transaction, or none, and each
 * one dispatches its resource event and invalidates the cached tag query.
 */
describe('Bulk create, update, and delete routes', () => {
  let app: Application;
  let tags: any;
  let users: any;
  let auth: Record<string, string>;

  const request = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: any,
    headers: Record<string, string> = auth
  ) => {
    const response = await app.server.inject({
      method,
      url,
      payload,
      headers
    });
    return { status: response.statusCode, body: response.json() };
  };

  const storedNames = async (): Promise<string[]> =>
    (await tags.client.findMany({ orderBy: { name: 'asc' } })).map(
      (tag: any) => tag.name
    );

  /** Records the resource events of the tags emitted while the function runs. */
  const recordEvents = async (
    action: 'create' | 'update' | 'delete',
    fn: () => Promise<unknown>
  ): Promise<any[]> => {
    const events = inject(Events);
    const received: any[] = [];
    const listenerId = events.onResourceEvent('Tag', action, (event: any) => {
      received.push(event.current);
    });
    try {
      await fn();
      // The events are emitted once the transaction commits
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      events.removeResourceEvent(listenerId);
    }
    return received;
  };

  const signInAdmin = async (): Promise<Record<string, string>> => {
    const email = 'bulk-operations@example.com';
    const password = 'BulkOperations!Pass1';

    await users.client.deleteMany({ where: { email } });
    await users.client.create({
      data: {
        firstName: 'Bulk',
        lastName: 'Operations',
        email,
        phone: '+38512345671',
        passwordHash: await hashPassword(password),
        roles: {
          connectOrCreate: {
            where: { name: 'Admin' },
            create: { name: 'Admin' }
          }
        }
      }
    });

    const response = await app.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: email, password }
    });

    return { authorization: `Bearer ${response.json().accessToken}` };
  };

  beforeAll(async () => {
    app = await createApp();
    tags = injectService('Tag');
    users = injectService('User');
    auth = await signInAdmin();
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await tags.client.deleteMany({});
  });

  test('creates every tag of the request', async () => {
    const events = await recordEvents('create', async () => {
      const { status, body } = await request('POST', '/api/tags/bulk', [
        { name: 'Nature', slug: 'nature' },
        { name: 'Ocean', slug: 'ocean' },
        { name: 'Forest', slug: 'forest' }
      ]);

      expect(status).toBe(201);
      // The created tags, with their generated ids, in the order of the items
      expect(body).toMatchObject([
        { id: expect.any(Number), name: 'Nature', slug: 'nature' },
        { id: expect.any(Number), name: 'Ocean', slug: 'ocean' },
        { id: expect.any(Number), name: 'Forest', slug: 'forest' }
      ]);
    });

    expect(await storedNames()).toEqual(['Forest', 'Nature', 'Ocean']);
    expect(events.map((tag) => tag.name)).toEqual([
      'Nature',
      'Ocean',
      'Forest'
    ]);
  });

  test('creates none of the tags when one of them fails', async () => {
    await tags.client.create({ data: { name: 'Taken', slug: 'taken' } });

    const events = await recordEvents('create', async () => {
      const { status, body } = await request('POST', '/api/tags/bulk', [
        { name: 'Nature', slug: 'nature' },
        { name: 'Taken', slug: 'taken' },
        { name: 'Ocean', slug: 'ocean' }
      ]);

      expect(status).toBe(409);
      expect(body.code).toBe('DATABASE_UNIQUE_VIOLATION');
    });

    expect(await storedNames()).toEqual(['Taken']);
    expect(events).toEqual([]);
  });

  test('updates the given fields of every tag with PATCH', async () => {
    const nature = await tags.client.create({
      data: { name: 'Nature', slug: 'nature' }
    });
    const ocean = await tags.client.create({
      data: { name: 'Ocean', slug: 'ocean' }
    });

    const events = await recordEvents('update', async () => {
      const { status, body } = await request('PATCH', '/api/tags/bulk', [
        { id: nature.id, data: { name: 'Wildlife' } },
        { id: ocean.id, data: { name: 'Sea' } }
      ]);

      expect(status).toBe(200);
      expect(body).toMatchObject([
        { id: nature.id, name: 'Wildlife', slug: 'nature' },
        { id: ocean.id, name: 'Sea', slug: 'ocean' }
      ]);
    });

    expect(await storedNames()).toEqual(['Sea', 'Wildlife']);
    expect(events).toHaveLength(2);
  });

  test('replaces every tag with PUT', async () => {
    const nature = await tags.client.create({
      data: { name: 'Nature', slug: 'nature' }
    });

    const { status, body } = await request('PUT', '/api/tags/bulk', [
      { id: nature.id, data: { name: 'Forest', slug: 'forest' } }
    ]);

    expect(status).toBe(200);
    expect(body).toMatchObject([
      { id: nature.id, name: 'Forest', slug: 'forest' }
    ]);
    expect(
      await tags.client.findUnique({ where: { id: nature.id } })
    ).toMatchObject({ name: 'Forest', slug: 'forest' });
  });

  test('updates none of the tags when one of them is missing', async () => {
    const nature = await tags.client.create({
      data: { name: 'Nature', slug: 'nature' }
    });

    const { status, body } = await request('PATCH', '/api/tags/bulk', [
      { id: nature.id, data: { name: 'Wildlife' } },
      { id: nature.id + 1000, data: { name: 'Missing' } }
    ]);

    expect(status).toBe(404);
    expect(body.code).toBe('RESOURCE_NOT_FOUND');
    expect(await storedNames()).toEqual(['Nature']);
  });

  test('deletes every tag of the request, or none', async () => {
    const created = await Promise.all(
      ['Nature', 'Ocean', 'Forest'].map((name) =>
        tags.client.create({ data: { name, slug: name.toLowerCase() } })
      )
    );
    const [nature, ocean, forest] = created.map((tag: any) => tag.id);

    const failed = await request('DELETE', '/api/tags/bulk', [
      nature,
      ocean + 1000
    ]);
    expect(failed.status).toBe(404);
    expect(await storedNames()).toEqual(['Forest', 'Nature', 'Ocean']);

    const events = await recordEvents('delete', async () => {
      const { status, body } = await request('DELETE', '/api/tags/bulk', [
        nature,
        ocean
      ]);

      expect(status).toBe(200);
      expect(body).toMatchObject([
        { id: nature, name: 'Nature' },
        { id: ocean, name: 'Ocean' }
      ]);
    });

    expect(await storedNames()).toEqual(['Forest']);
    expect(events.map((tag) => tag.id)).toEqual([nature, ocean]);
    expect(forest).toBeDefined();
  });

  test('invalidates the cached tag query', async () => {
    // The public tag query is cached, so it only sees the bulk changes once
    // they invalidate it
    const before = await request('GET', '/api/tags/query', undefined, {});
    expect(before.body.totalCount).toBe(0);

    await request('POST', '/api/tags/bulk', [
      { name: 'Nature', slug: 'nature' },
      { name: 'Ocean', slug: 'ocean' }
    ]);

    const after = await request('GET', '/api/tags/query', undefined, {});
    expect(after.body.totalCount).toBe(2);
  });

  test('rejects a request over the maximum items of the route', async () => {
    const items = Array.from({ length: 51 }, (_, index) => ({
      id: index + 1,
      data: { name: `Tag ${index}` }
    }));

    const { status, body } = await request('PATCH', '/api/tags/bulk', items);

    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  test('requires the access of the bulk route', async () => {
    const { status } = await request(
      'POST',
      '/api/tags/bulk',
      [{ name: 'Nature', slug: 'nature' }],
      {}
    );

    expect(status).toBe(401);
    expect(await storedNames()).toEqual([]);
  });
});
