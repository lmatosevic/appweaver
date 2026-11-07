import { TwoFactorClient } from '../../../clients/modules/two-factor-client';
import { createStubClient } from '../../fixtures/stub-client';

describe('two-factor-client', () => {
  const createTwoFactor = (data?: any) => {
    const stub = createStubClient({ data });
    return {
      stub,
      twoFactor: new TwoFactorClient<any>(stub.client, '/auth/account/2fa')
    };
  };

  describe('challenge', () => {
    test('posts the method of the challenge', async () => {
      const { stub, twoFactor } = createTwoFactor({ challengeId: 'challenge' });

      await expect(twoFactor.challenge({ method: 'sms' })).resolves.toEqual({
        challengeId: 'challenge'
      });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/2fa/challenge',
        params: { body: { method: 'sms' } }
      });
    });

    test('posts an empty body for the default method', async () => {
      const { stub, twoFactor } = createTwoFactor();

      await twoFactor.challenge();

      expect(stub.lastCall().params.body).toEqual({});
    });
  });

  describe('verify', () => {
    test('posts the code of the challenge', async () => {
      const { stub, twoFactor } = createTwoFactor();

      await twoFactor.verify({ challengeId: 'challenge', code: '123456' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/2fa/verify',
        params: { body: { challengeId: 'challenge', code: '123456' } }
      });
    });
  });

  describe('listMethods', () => {
    test('gets the methods', async () => {
      const { stub, twoFactor } = createTwoFactor({ enabled: ['totp'] });

      await expect(twoFactor.listMethods()).resolves.toEqual({
        enabled: ['totp']
      });
      expect(stub.lastCall()).toMatchObject({
        method: 'get',
        path: '/auth/account/2fa/methods'
      });
    });
  });

  describe('enableMethod', () => {
    test('posts the method to enable', async () => {
      const { stub, twoFactor } = createTwoFactor();

      await twoFactor.enableMethod({ method: 'email' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/2fa/methods',
        params: { body: { method: 'email' } }
      });
    });
  });

  describe('orderMethods', () => {
    test('puts the new order', async () => {
      const { stub, twoFactor } = createTwoFactor();

      await twoFactor.orderMethods({ methods: ['sms', 'email'] });

      expect(stub.lastCall()).toMatchObject({
        method: 'put',
        path: '/auth/account/2fa/methods/order',
        params: { body: { methods: ['sms', 'email'] } }
      });
    });
  });

  describe('disableMethod', () => {
    test('deletes the method with the password', async () => {
      const { stub, twoFactor } = createTwoFactor();

      await twoFactor.disableMethod('totp', { password: 'secret' });

      expect(stub.lastCall()).toMatchObject({
        method: 'delete',
        path: '/auth/account/2fa/methods/{method}',
        params: {
          body: { password: 'secret' },
          params: { path: { method: 'totp' } }
        }
      });
    });

    test('deletes the method of a user without a password', async () => {
      const { stub, twoFactor } = createTwoFactor();

      await twoFactor.disableMethod('email');

      expect(stub.lastCall().params.body).toEqual({});
    });
  });

  describe('setupTotp', () => {
    test('posts to the TOTP setup path', async () => {
      const { stub, twoFactor } = createTwoFactor({ secret: 'ABC' });

      await expect(twoFactor.setupTotp()).resolves.toEqual({ secret: 'ABC' });
      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/2fa/totp/setup'
      });
    });
  });

  describe('confirmTotp', () => {
    test('posts the code of the authenticator app', async () => {
      const { stub, twoFactor } = createTwoFactor();

      await twoFactor.confirmTotp({ code: '123456' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/2fa/totp/confirm',
        params: { body: { code: '123456' } }
      });
    });
  });

  describe('generateRecoveryCodes', () => {
    test('posts the password to the recovery codes path', async () => {
      const { stub, twoFactor } = createTwoFactor({ codes: ['A'] });

      await expect(
        twoFactor.generateRecoveryCodes({ password: 'secret' })
      ).resolves.toEqual({ codes: ['A'] });
      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/2fa/recovery-codes',
        params: { body: { password: 'secret' } }
      });
    });

    test('posts an empty body for a user without a password', async () => {
      const { stub, twoFactor } = createTwoFactor();

      await twoFactor.generateRecoveryCodes();

      expect(stub.lastCall().params.body).toEqual({});
    });
  });
});
