import { configOverrides } from '@appweaver/common';
import { Application, createApp, injectService } from '@appweaver/core';
import { hashPassword } from '@appweaver/data';
import { resetTestData } from './support/reset';

/**
 * The author of a post is public, so the post routes leave out the contact
 * details the `omit` of its relation names, while the account of the author
 * still shows them to the author.
 */
describe('Post author', () => {
  const email = 'post-author@example.com';
  const password = 'PostAuthor!Pass1';
  let app: Application;
  let postId: number;
  let token: string;

  beforeAll(async () => {
    // The login route would otherwise verify a reCAPTCHA token with Google
    configOverrides.SECURITY_RECAPTCHA_ENABLED = false;
    app = await createApp();
    const author = await injectService('User').client.create({
      data: {
        firstName: 'Paula',
        lastName: 'Writer',
        email,
        phone: '+38512345699',
        passwordHash: await hashPassword(password)
      }
    });
    const post = await injectService('Post').client.create({
      data: {
        title: 'Public post',
        slug: 'public-post',
        status: 'Published',
        author: { connect: { id: author.id } }
      }
    });
    postId = post.id;
    const login = await app.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: email, password }
    });
    token = login.json().accessToken;
  }, 30_000);

  afterAll(async () => {
    await app.stop();
    delete configOverrides.SECURITY_RECAPTCHA_ENABLED;
  });

  afterAll(resetTestData, 10_000);

  test('shows the author of a post without their contact details', async () => {
    const found = await app.server.inject({
      method: 'GET',
      url: `/api/posts/${postId}`
    });
    const queried = await app.server.inject({
      method: 'POST',
      url: '/api/posts/query',
      payload: { filter: { slug: 'public-post' } }
    });

    for (const author of [
      found.json().author,
      queried.json().items[0].author
    ]) {
      expect(author).toMatchObject({
        firstName: 'Paula',
        byline: 'Paula Writer'
      });
      for (const field of ['email', 'phone', 'phoneNumber', 'logoutAt']) {
        expect(author).not.toHaveProperty(field);
      }
    }
  });

  test('keeps the contact details on the account of the author', async () => {
    const me = await app.server.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(me.json()).toMatchObject({ email, phone: '+38512345699' });
  });
});
