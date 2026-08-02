import { AuthClient } from '../../../clients/modules/auth-client';
import { createStubClient } from '../../fixtures/stub-client';

describe('auth-client', () => {
  const createAuth = (data?: any) => {
    const stub = createStubClient({ data });
    return { stub, auth: new AuthClient<any>(stub.client, '/auth') };
  };

  describe('login', () => {
    test('posts the credentials to the login path', async () => {
      const { stub, auth } = createAuth({ accessToken: 'token' });

      await expect(
        auth.login({ username: 'admin', password: 'secret' })
      ).resolves.toEqual({ accessToken: 'token' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/login'
      });
      expect(stub.lastCall().params.body).toEqual({
        username: 'admin',
        password: 'secret'
      });
    });
  });

  describe('logout', () => {
    test('posts to the logout path', async () => {
      const { stub, auth } = createAuth();

      await auth.logout();

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/logout'
      });
    });
  });

  describe('refresh', () => {
    test('posts to the refresh path', async () => {
      const { stub, auth } = createAuth();

      await auth.refresh();

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/refresh'
      });
    });
  });

  describe('changePassword', () => {
    test('posts the payload to the change password path', async () => {
      const { stub, auth } = createAuth();

      await auth.changePassword({ oldPassword: 'a', newPassword: 'b' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/change-password'
      });
      expect(stub.lastCall().params.body).toEqual({
        oldPassword: 'a',
        newPassword: 'b'
      });
    });
  });

  describe('exchangeToken', () => {
    test('posts the payload to the exchange token path', async () => {
      const { stub, auth } = createAuth();

      await auth.exchangeToken({ token: 'external' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/exchange-token'
      });
      expect(stub.lastCall().params.body).toEqual({ token: 'external' });
    });
  });

  describe('me', () => {
    test('gets the identity of the authenticated user', async () => {
      const { stub, auth } = createAuth({ id: 1, username: 'admin' });

      await expect(auth.me()).resolves.toEqual({ id: 1, username: 'admin' });
      expect(stub.lastCall()).toMatchObject({
        method: 'get',
        path: '/auth/me'
      });
    });

    test('forwards the request options', async () => {
      const { stub, auth } = createAuth();

      await auth.me({ headers: { 'x-test': '1' } });

      expect(stub.lastCall().params.headers).toEqual({ 'x-test': '1' });
    });
  });

  test('uses the configured base path for every operation', async () => {
    const stub = createStubClient();
    const auth = new AuthClient<any>(stub.client, '/api/auth');

    await auth.login({});
    await auth.me();

    expect(stub.calls.map((c) => c.path)).toEqual([
      '/api/auth/login',
      '/api/auth/me'
    ]);
  });
});
