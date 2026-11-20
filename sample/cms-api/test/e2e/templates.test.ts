import {
  Application,
  createApp,
  EmailService,
  inject,
  injectService
} from '@appweaver/core';
import { TemplateEngine } from '@appweaver/common';
import { hashPassword } from '@appweaver/data';
import { resetTestData } from './support/reset';

/**
 * Exercises the templates of the `templates` directory and the translations of
 * the `locales` directory: a localized HTML page, an XML export for an external
 * integration, a localized email sent on demand, the localized sign-in pages
 * of the MCP clients, and a translated default value stored by a service hook.
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
    app = await createApp();
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
        url: '/api/posts/trails-and-peaks/page?locale=de'
      });

      expect(response.body).toContain('<html lang="de">');
      expect(response.body).toContain('Veröffentlicht am 31. Januar 2026');
      expect(response.body).toContain('Schlagwörter:');
      expect(response.body).toContain('1 Kommentar');
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
        payload: { email: 'reader@example.com', locale: 'de' }
      });

      expect(response.statusCode).toBe(200);
      const email = await renderEmail.mock.results[0].value;
      expect(email.to).toBe('reader@example.com');
      expect(email.subject).toBe(
        'templates@example.com hat einen Beitrag mit Ihnen geteilt: Trails & <Peaks>'
      );
      expect(email.html).toContain('<html lang="de">');
      expect(email.html).toContain('Beitrag lesen');
      expect(email.text).toContain(
        '/api/posts/trails-and-peaks/page?locale=de'
      );
      expect(email.text).toContain('Diese E-Mail wurde von CMS API gesendet.');
    });

    test('translates the framework emails with the translation files', async () => {
      const email = await emailService.renderTemplateEmail({
        to: 'reader@example.com',
        template: 'emails/two-factor-code',
        data: { code: '123456', expiresInMinutes: 3 },
        locale: 'de'
      });

      expect(email.subject).toBe('Ihr Bestätigungscode');
      expect(email.text).toContain('Der Code läuft in 3 Minuten ab.');
    });
  });

  describe('MCP sign-in pages', () => {
    const redirectUri = 'http://127.0.0.1:4000/callback';

    const authorize = async (headers: Record<string, string> = {}) => {
      const register = await app.server.inject({
        method: 'POST',
        url: '/oauth/register',
        payload: { redirect_uris: [redirectUri], client_name: 'Claude' }
      });
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: register.json().client_id,
        redirect_uri: redirectUri,
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256'
      });
      return app.server.inject({
        method: 'GET',
        url: `/oauth/authorize?${params}`,
        headers
      });
    };

    test('renders the sign-in with the providers in the layout of the forms', async () => {
      const response = await authorize();

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('<html lang="en">');
      expect(response.body).toContain('<title>Sign in · CMS API</title>');
      expect(response.body).toContain('Claude of 127.0.0.1:4000 asks to act');
      expect(response.body).toContain('class="button outline provider-google"');
      expect(response.body).toContain('Continue with Facebook');
      expect(response.body).toContain(
        'Signing in to CMS API on behalf of your AI agent.'
      );
    });

    test('signs a user in with the password form, showing a wrong password in the locale', async () => {
      const headers = { 'accept-language': 'de' };
      const submit = (page: string, password: string) =>
        app.server.inject({
          method: 'POST',
          url: '/oauth/sign-in',
          headers: {
            ...headers,
            'content-type': 'application/x-www-form-urlencoded'
          },
          payload: new URLSearchParams({
            state: /name="state" value="([^"]+)"/.exec(page)![1],
            username: 'templates@example.com',
            password
          }).toString()
        });

      const page = await authorize(headers);
      expect(page.body).toContain('<div class="divider">oder</div>');
      expect(page.body).toContain('<label for="username">E-Mail</label>');

      const wrong = await submit(page.body, 'wrong');
      expect(wrong.statusCode).toBe(401);
      expect(wrong.body).toContain(
        'Die E-Mail-Adresse oder das Passwort ist ungültig.'
      );

      const back = await submit(wrong.body, 'Templates!Pass1');
      expect(back.statusCode).toBe(302);
      const location = new URL(back.headers.location as string);
      expect(location.origin + location.pathname).toBe(redirectUri);
      expect(location.searchParams.get('code')).toBeTruthy();
    });

    test('renders the sign-in in the locale of the browser', async () => {
      const response = await authorize({ 'accept-language': 'de-DE,de;q=0.9' });

      expect(response.body).toContain('<html lang="de-DE">');
      expect(response.body).toContain('<h1>Anmelden</h1>');
      expect(response.body).toContain('möchte in Ihrem Namen handeln');
      expect(response.body).toContain('Weiter mit Google');
    });

    test('renders the error of an unknown client', async () => {
      const response = await app.server.inject({
        method: 'GET',
        url: '/oauth/authorize?client_id=unknown',
        headers: { 'accept-language': 'de' }
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('<h1>Anmeldung fehlgeschlagen</h1>');
      expect(response.body).toContain('Der Client ist unbekannt');
    });

    test('renders the password and the 2FA forms', async () => {
      const engine = inject(TemplateEngine);

      const password = await engine.render(
        'mcp/password.html',
        { action: '/oauth/sign-in', state: 'abc', error: 'Wrong' },
        { locale: 'de' }
      );
      expect(password).toContain('<h1>Passwort bestätigen</h1>');
      expect(password).toContain('<p class="error" role="alert">Wrong</p>');
      expect(password).toContain('name="state" value="abc"');

      const twoFactor = await engine.render(
        'mcp/two-factor.html',
        {
          action: '/oauth/sign-in',
          state: 'abc',
          hint: 'Enter the code of your authenticator app.',
          methods: [
            { value: 'Totp', label: 'Authenticator app', selected: true },
            { value: 'Recovery', label: 'Recovery code', selected: false }
          ]
        },
        { locale: 'en' }
      );
      expect(twoFactor).toContain('<h1>Two-factor authentication</h1>');
      expect(twoFactor).toContain('<option value="Totp" selected>');
      expect(twoFactor).toContain('or use another method');
      expect(twoFactor.indexOf('value="verify"')).toBeLessThan(
        twoFactor.indexOf('value="resend"')
      );
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
