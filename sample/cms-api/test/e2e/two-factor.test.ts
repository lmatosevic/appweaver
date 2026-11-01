import {
  AuthSource,
  configOverrides,
  Database,
  Mailer,
  SmsSender
} from '@appweaver/common';
import { Application, createApp, inject } from '@appweaver/core';
import { AuthService } from '@appweaver/web';
import { createHmac } from 'node:crypto';
import { resetTestData } from './support/reset';

/** The TOTP code of RFC 6238 of a Base32 secret, as an authenticator app computes it. */
function totp(secret: string, offset = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(
    bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2))
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const binary = hmac.readUInt32BE(hmac[hmac.length - 1] & 15) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

/**
 * Exercises the two-factor authentication against the real database: an authenticator app (TOTP) set up and
 * confirmed, the email and SMS methods with a verified phone number, the sign-in challenged by the default method or
 * another one, and the methods ordered and disabled.
 */
describe('Two-factor authentication', () => {
  const email = 'two-factor@example.com';
  const password = 'Tw0-Factor!Pass';
  let app: Application;
  let sendEmail: jest.SpyInstance;
  let sendSms: jest.SpyInstance;
  // The secret of the authenticator app, and a token of the auth scope, kept by the tests for the next ones
  let secret: string;
  let fullToken: string;

  const request = async (
    method: string,
    url: string,
    token?: string,
    payload?: object
  ) =>
    app.server.inject({
      method: method as any,
      url,
      payload,
      headers: token ? { authorization: `Bearer ${token}` } : {}
    });

  const login = async () =>
    (
      await request('POST', '/auth/login', undefined, {
        username: email,
        password
      })
    ).json();

  /** The code of the last email, sent by the queue of the mailer. */
  const emailedCode = async (): Promise<string> => {
    for (let i = 0; i < 100 && sendEmail.mock.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const { text } = sendEmail.mock.calls.at(-1)[0];
    return text.match(/\b(\d{6})\b/)[1];
  };

  const textedCode = (): string =>
    sendSms.mock.calls.at(-1)[0].text.match(/^(\d{6}) /)[1];

  beforeAll(async () => {
    // The login route would otherwise verify a reCAPTCHA token with Google
    configOverrides.SECURITY_RECAPTCHA_ENABLED = false;
    app = await createApp();

    // The registration data of the sample connects the User role
    await inject<any>(Database)
      .client()
      .role.upsert({
        where: { name: 'User' },
        update: {},
        create: { name: 'User' }
      });

    const authService = inject(AuthService);
    const user = await authService.registerAuthUser(
      AuthSource.Password,
      email,
      password,
      { firstName: 'Two', lastName: 'Factor' }
    );
    await authService.updateAuthUser(user.id, { verifiedEmail: true });

    sendEmail = jest.spyOn(inject(Mailer), 'sendEmail');
    sendSms = jest.spyOn(inject(SmsSender), 'sendSms');
  });

  beforeEach(() => {
    sendEmail.mockClear();
    sendSms.mockClear();
  });

  afterAll(async () => {
    await app.stop();
    delete configOverrides.SECURITY_RECAPTCHA_ENABLED;
  });

  afterAll(resetTestData, 10_000);

  test('signs in without 2FA before a method is enabled', async () => {
    const tokens = await login();

    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens).not.toHaveProperty('twoFactorMethods');

    const methods = await request(
      'GET',
      '/auth/account/2fa/methods',
      tokens.accessToken
    );
    expect(methods.json()).toEqual({
      enabled: [],
      available: ['email', 'sms', 'totp']
    });
  });

  test('enables an authenticator app with its first code', async () => {
    const { accessToken } = await login();

    const setup = await request(
      'POST',
      '/auth/account/2fa/totp/setup',
      accessToken
    );
    const { otpauthUrl } = setup.json();
    secret = setup.json().secret;
    expect(otpauthUrl).toBe(
      `otpauth://totp/CMS:two-factor%40example.com?secret=${secret}&issuer=CMS&algorithm=SHA1&digits=6&period=30`
    );

    const wrong = await request(
      'POST',
      '/auth/account/2fa/totp/confirm',
      accessToken,
      {
        code: totp(secret, 5)
      }
    );
    expect(wrong.json().code).toBe('ACCOUNT_2FA_CODE_INVALID');

    const confirm = await request(
      'POST',
      '/auth/account/2fa/totp/confirm',
      accessToken,
      {
        code: totp(secret)
      }
    );
    expect(confirm.json().enabled).toEqual(['totp']);
  });

  test('challenges the sign-in with the default method', async () => {
    const tokens = await login();
    expect(tokens.twoFactorMethods).toEqual(['totp']);

    // The token of the 2fa scope only passes the challenge
    const me = await request('GET', '/auth/me', tokens.accessToken);
    expect(me.json().code).toBe('AUTH_SCOPE_FORBIDDEN');

    // Nor is its refresh token refreshed into the auth scope
    const refreshed = await request(
      'POST',
      '/auth/refresh',
      tokens.refreshToken
    );
    expect(refreshed.json().code).toBe('AUTH_SCOPE_FORBIDDEN');

    const challenge = await request(
      'POST',
      '/auth/account/2fa/challenge',
      tokens.accessToken,
      {}
    );
    expect(challenge.json()).toMatchObject({
      method: 'totp',
      destination: null,
      methods: ['totp']
    });
    const { challengeId } = challenge.json();

    // The code that confirmed the setup is never accepted again
    const replayed = await request(
      'POST',
      '/auth/account/2fa/verify',
      tokens.accessToken,
      {
        challengeId,
        code: totp(secret)
      }
    );
    expect(replayed.json()).toMatchObject({
      code: 'ACCOUNT_2FA_CODE_INVALID',
      details: { attemptsLeft: 4 }
    });

    const verify = await request(
      'POST',
      '/auth/account/2fa/verify',
      tokens.accessToken,
      {
        challengeId,
        code: totp(secret, 1)
      }
    );
    const { token } = verify.json();

    const exchanged = await request('POST', '/auth/exchange-token', undefined, {
      token
    });
    expect(exchanged.json()).not.toHaveProperty('twoFactorMethods');

    fullToken = exchanged.json().accessToken;
    const authenticated = await request('GET', '/auth/me', fullToken);
    expect(authenticated.json().email).toBe(email);
  });

  test('verifies a phone number and challenges by the requested method', async () => {
    // Every code of the authenticator app in the window was used, so the user keeps their session
    const accessToken = fullToken;

    const notVerified = await request(
      'POST',
      '/auth/account/2fa/methods',
      accessToken,
      {
        method: 'sms'
      }
    );
    expect(notVerified.json().code).toBe('ACCOUNT_PHONE_NOT_VERIFIED');

    const sent = await request(
      'POST',
      '/auth/account/send-verify-phone',
      accessToken,
      {
        phoneNumber: '+385911234567'
      }
    );
    expect(sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+385911234567' })
    );
    const verified = await request(
      'POST',
      '/auth/account/verify-phone',
      accessToken,
      {
        challengeId: sent.json().challengeId,
        code: textedCode()
      }
    );
    expect(verified.json().message).toBe('Phone number verified');

    const sms = await request(
      'POST',
      '/auth/account/2fa/methods',
      accessToken,
      {
        method: 'sms'
      }
    );
    const mail = await request(
      'POST',
      '/auth/account/2fa/methods',
      accessToken,
      {
        method: 'email'
      }
    );
    expect(sms.json().enabled).toEqual(['totp', 'sms']);
    expect(mail.json().enabled).toEqual(['totp', 'sms', 'email']);

    // Signed in again, the user picks the SMS code over the default method
    const next = await login();
    expect(next.twoFactorMethods).toEqual(['totp', 'sms', 'email']);
    const texted = await request(
      'POST',
      '/auth/account/2fa/challenge',
      next.accessToken,
      {
        method: 'sms'
      }
    );
    expect(texted.json()).toMatchObject({
      method: 'sms',
      destination: '+385*******67'
    });
    const passed = await request(
      'POST',
      '/auth/account/2fa/verify',
      next.accessToken,
      {
        challengeId: texted.json().challengeId,
        code: textedCode()
      }
    );
    expect(passed.json().token).toEqual(expect.any(String));
  });

  test('orders the methods and challenges by email', async () => {
    const tokens = await login();
    const challenge = await request(
      'POST',
      '/auth/account/2fa/challenge',
      tokens.accessToken,
      {
        method: 'email'
      }
    );
    expect(challenge.json().destination).toBe('t***@example.com');
    const verify = await request(
      'POST',
      '/auth/account/2fa/verify',
      tokens.accessToken,
      {
        challengeId: challenge.json().challengeId,
        code: await emailedCode()
      }
    );
    const { accessToken } = (
      await request('POST', '/auth/exchange-token', undefined, {
        token: verify.json().token
      })
    ).json();

    const ordered = await request(
      'PUT',
      '/auth/account/2fa/methods/order',
      accessToken,
      {
        methods: ['email', 'totp', 'sms']
      }
    );
    expect(ordered.json().enabled).toEqual(['email', 'totp', 'sms']);

    const disabled = await request(
      'DELETE',
      '/auth/account/2fa/methods/totp',
      accessToken,
      {
        password
      }
    );
    expect(disabled.json().enabled).toEqual(['email', 'sms']);

    expect((await login()).twoFactorMethods).toEqual(['email', 'sms']);
  });
});
