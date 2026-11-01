import { AccountClient } from '../../../clients/modules/account-client';
import { createStubClient } from '../../fixtures/stub-client';

describe('account-client', () => {
  const createAccount = (data?: any) => {
    const stub = createStubClient({ data });
    return {
      stub,
      account: new AccountClient<any>(stub.client, '/auth/account')
    };
  };

  describe('sendVerifyEmail', () => {
    test('posts the payload to the send verify email path', async () => {
      const { stub, account } = createAccount({ status: true });

      await expect(
        account.sendVerifyEmail({ email: 'user@test.com' })
      ).resolves.toEqual({ status: true });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/send-verify-email'
      });
      expect(stub.lastCall().params.body).toEqual({ email: 'user@test.com' });
    });
  });

  describe('verifyEmail', () => {
    test('posts the verification token', async () => {
      const { stub, account } = createAccount();

      await account.verifyEmail({ token: 'abc' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/verify-email'
      });
      expect(stub.lastCall().params.body).toEqual({ token: 'abc' });
    });
  });

  describe('verifyEmailRedirect', () => {
    test('passes the token as a query parameter', async () => {
      const { stub, account } = createAccount();

      await account.verifyEmailRedirect('abc');

      expect(stub.lastCall()).toMatchObject({
        method: 'get',
        path: '/auth/account/verify-email-redirect'
      });
      expect(stub.lastCall().params.params.query).toEqual({ token: 'abc' });
    });

    test('keeps the existing query parameters', async () => {
      const { stub, account } = createAccount();

      await account.verifyEmailRedirect('abc', {
        params: { query: { redirect: '/home' } }
      });

      expect(stub.lastCall().params.params.query).toEqual({
        redirect: '/home',
        token: 'abc'
      });
    });
  });

  describe('sendResetPassword', () => {
    test('posts the payload to the send reset password path', async () => {
      const { stub, account } = createAccount();

      await account.sendResetPassword({ email: 'user@test.com' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/send-reset-password'
      });
    });
  });

  describe('resetPassword', () => {
    test('posts the reset token and the new password', async () => {
      const { stub, account } = createAccount();

      await account.resetPassword({ token: 'abc', newPassword: 'secret' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/reset-password'
      });
      expect(stub.lastCall().params.body).toEqual({
        token: 'abc',
        newPassword: 'secret'
      });
    });
  });

  describe('sendVerifyPhone', () => {
    test('posts the phone number to the send verify phone path', async () => {
      const { stub, account } = createAccount({ challengeId: 'challenge' });

      await expect(
        account.sendVerifyPhone({ phoneNumber: '+385911234567' })
      ).resolves.toEqual({ challengeId: 'challenge' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/send-verify-phone'
      });
      expect(stub.lastCall().params.body).toEqual({
        phoneNumber: '+385911234567'
      });
    });
  });

  describe('verifyPhone', () => {
    test('posts the code of the challenge', async () => {
      const { stub, account } = createAccount();

      await account.verifyPhone({ challengeId: 'challenge', code: '123456' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/auth/account/verify-phone'
      });
      expect(stub.lastCall().params.body).toEqual({
        challengeId: 'challenge',
        code: '123456'
      });
    });
  });
});
