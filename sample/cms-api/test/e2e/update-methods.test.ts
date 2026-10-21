import { Application, createApp, injectService } from '@appweaver/core';
import { hashPassword } from '@appweaver/data';
import { resetTestData } from './support/reset';

/**
 * Exercises the PATCH and PUT update routes against the real database. PATCH
 * updates the given fields, while PUT replaces the page as a whole, resetting
 * the fields it leaves out.
 */
describe('Update and replace routes', () => {
  let app: Application;
  let pages: any;
  let users: any;
  let auth: Record<string, string>;
  let pageId: number;

  const request = async (
    method: 'GET' | 'PUT' | 'PATCH',
    url: string,
    payload?: any
  ) => {
    const response = await app.server.inject({
      method,
      url,
      payload,
      headers: auth
    });
    return { status: response.statusCode, body: response.json() };
  };

  const signInAdmin = async (): Promise<Record<string, string>> => {
    const email = 'update-methods@example.com';
    const password = 'UpdateMethods!Pass1';

    await users.client.deleteMany({ where: { email } });
    await users.client.create({
      data: {
        firstName: 'Update',
        lastName: 'Methods',
        email,
        phone: '+38512345670',
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
    pages = injectService('Page');
    users = injectService('User');
    auth = await signInAdmin();
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await pages.client.deleteMany({});
    const page = await pages.client.create({
      data: {
        title: 'About us',
        slug: 'about-us',
        content: '<p>About</p>',
        status: 'Published',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        showInMenu: true,
        menuPosition: 4,
        seo: { title: 'About' }
      }
    });
    pageId = page.id;
  });

  test('updates only the given fields with PATCH', async () => {
    const { status, body } = await request('PATCH', `/api/pages/${pageId}`, {
      title: 'About the team'
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      title: 'About the team',
      slug: 'about-us',
      status: 'Published',
      showInMenu: true,
      menuPosition: 4,
      seo: { title: 'About' }
    });
    expect(body.publishedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  test('resets the fields left out to their default value or null with PUT', async () => {
    const { status, body } = await request('PUT', `/api/pages/${pageId}`, {
      title: 'About the team',
      slug: 'about-the-team',
      content: '<p>Team</p>'
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      title: 'About the team',
      slug: 'about-the-team',
      content: '<p>Team</p>',
      status: 'Draft',
      showInMenu: false,
      menuPosition: 0
    });
    expect(body.publishedAt ?? null).toBeNull();
    expect(body.seo ?? null).toBeNull();

    const stored = await pages.client.findUnique({ where: { id: pageId } });
    expect(stored).toMatchObject({
      status: 'Draft',
      publishedAt: null,
      seo: null,
      showInMenu: false,
      menuPosition: 0
    });
  });

  test('keeps the values the PUT body gives', async () => {
    const { body } = await request('PUT', `/api/pages/${pageId}`, {
      title: 'About',
      slug: 'about',
      content: '<p>About</p>',
      status: 'Archived',
      menuPosition: 2
    });

    expect(body).toMatchObject({
      status: 'Archived',
      menuPosition: 2,
      showInMenu: false
    });
  });

  test('rejects a PUT body missing a required field', async () => {
    const { status, body } = await request('PUT', `/api/pages/${pageId}`, {
      title: 'About the team'
    });

    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_FAILED');

    const stored = await pages.client.findUnique({ where: { id: pageId } });
    expect(stored.title).toBe('About us');
  });
});
