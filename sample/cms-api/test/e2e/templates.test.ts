import {
  Application,
  createApp,
  EmailService,
  hashPassword,
  inject,
  injectService
} from '@appweaver/core';
import { resetTestData } from './support/reset';

/**
 * Exercises the templates of the `templates` directory and the translations of
 * the `locales` directory: a localized HTML page, an XML export for an external
 * integration, a localized email sent on demand, and a translated default value
 * stored by a service hook.
 */
describe('Templates and locales', () => {
  let app: Application;
  let auth: Record<string, string>;
  let users: any;
  let posts: any;
  let emailService: EmailService;

  const signInAdmin = async (): Promise<Record<string, string>> => {
    const email = 'templates@example.com';
    const password = 'Templates!Pass1';

    // The records of an earlier run are removed, so the seed can be repeated
    await posts.client.deleteMany({ where: { slug: 'trails-and-peaks' } });
    await injectService('Category').client.deleteMany({
      where: { slug: { in: ['templates-travel', 'templates-food'] } }
    });
    await injectService('Tag').client.deleteMany({
      where: { slug: { in: ['templates-hiking', 'templates-alps'] } }
    });
    await users.client.deleteMany({ where: { email } });
    const admin = await users.client.create({
      data: {
        firstName: 'Ana',
        lastName: 'Anic',
        email,
        phone: '+38512345679',
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

    await posts.client.create({
      data: {
        title: 'Trails & <Peaks>',
        slug: 'trails-and-peaks',
        excerpt: 'Ten walks ]]> worth it',
        content: 'The content',
        status: 'Published',
        publishedAt: new Date(Date.UTC(2026, 0, 31, 12)),
        author: { connect: { id: admin.id } },
        category: { create: { name: 'Travel', slug: 'templates-travel' } },
        tags: {
          create: [
            { name: 'Hiking', slug: 'templates-hiking' },
            { name: 'Alps', slug: 'templates-alps' }
          ]
        },
        comments: {
          create: [
            { body: 'Lovely read', status: 'Approved' },
            { body: 'Spam', status: 'Spam' }
          ]
        }
      }
    });

    return { authorization: `Bearer ${response.json().accessToken}` };
  };

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    users = injectService('User');
    posts = injectService('Post');
    emailService = inject(EmailService);
    auth = await signInAdmin();
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  describe('HTML page', () => {
    test('renders a published post in the default locale', async () => {
      const response = await app.server.inject({
        method: 'GET',
        url: '/api/posts/trails-and-peaks/page'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.body).toContain('<html lang="en">');
      expect(response.body).toContain('<h1>Trails &amp; &lt;Peaks&gt;</h1>');
      expect(response.body).toContain('Published on January 31, 2026');
      expect(response.body).toContain('by Ana Anic');
      expect(response.body).toContain('<li>Alps</li>');
      expect(response.body).toContain('1 comment');
    });

    test('renders a published post in the requested locale', async () => {
      const response = await app.server.inject({
        method: 'GET',
        url: '/api/posts/trails-and-peaks/page?locale=hr'
      });

      expect(response.body).toContain('<html lang="hr">');
      expect(response.body).toContain('Objavljeno 31. siječnja 2026.');
      expect(response.body).toContain('Oznake:');
      expect(response.body).toContain('1 komentar');
    });

    test('responds with a problem for an unknown post', async () => {
      const response = await app.server.inject({
        method: 'GET',
        url: '/api/posts/missing/page'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('XML export', () => {
    test('exports the published posts', async () => {
      const response = await app.server.inject({
        method: 'GET',
        url: '/api/posts/export/xml',
        headers: auth
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe(
        'application/xml; charset=utf-8'
      );
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="posts.xml"'
      );
      expect(response.body).toMatch(/^<\?xml version="1\.0"/);
      expect(response.body).toContain(
        '<title>Trails &amp; &lt;Peaks&gt;</title>'
      );
      expect(response.body).toContain(
        '<publishedAt>2026-01-31T12:00:00.000Z</publishedAt>'
      );
      expect(response.body).toContain('<author id=');
      expect(response.body).toContain('<tag>Hiking</tag>');
      expect(response.body).toContain(
        '<excerpt><![CDATA[Ten walks ]]]]><![CDATA[> worth it]]></excerpt>'
      );
    });

    test('rejects an unauthenticated request', async () => {
      const response = await app.server.inject({
        method: 'GET',
        url: '/api/posts/export/xml'
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Localized email', () => {
    test('emails a post in the requested locale', async () => {
      const renderEmail = jest.spyOn(emailService, 'renderTemplateEmail');

      const response = await app.server.inject({
        method: 'POST',
        url: '/api/posts/trails-and-peaks/share',
        headers: auth,
        payload: { email: 'reader@example.com', locale: 'hr' }
      });

      expect(response.statusCode).toBe(200);
      const email = await renderEmail.mock.results[0].value;
      expect(email.to).toBe('reader@example.com');
      expect(email.subject).toBe(
        'templates@example.com dijeli objavu s vama: Trails & <Peaks>'
      );
      expect(email.html).toContain('<html lang="hr">');
      expect(email.html).toContain('Pročitajte objavu');
      expect(email.text).toContain(
        '/api/posts/trails-and-peaks/page?locale=hr'
      );
      expect(email.text).toContain('Ovu poruku poslala je aplikacija CMS API.');
    });

    test('translates the framework emails with the translation files', async () => {
      const email = await emailService.renderTemplateEmail({
        to: 'reader@example.com',
        template: 'emails/two-factor-code',
        data: { code: '123456', expiresInMinutes: 3 },
        locale: 'hr'
      });

      expect(email.subject).toBe('Vaš kontrolni kod');
      expect(email.text).toContain('Kod istječe za 3 minute.');
    });
  });

  describe('Localized hook', () => {
    test('stores a translated default description', async () => {
      const category = await injectService('Category').create({
        name: 'Food',
        slug: 'templates-food'
      });

      expect(category.description).toBe('Posts about Food.');
    });
  });
});
