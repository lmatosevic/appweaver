import {
  AuthError,
  AuthOTTPurpose,
  AuthSource,
  configOverrides,
  CONFIG,
  decryptText,
  encryptText,
  ErrorCode,
  makeHash,
  RESOURCE_AUTH,
  RESOURCE_NAME,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE,
  SecurityStore
} from '@appweaver/common';
import {
  define,
  EmailService,
  LocaleService,
  SmsService
} from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { hashPassword } from '@appweaver/data';
import { prismaError, resetContext } from '@appweaver/testing';
import { AuthService } from '../../../security/auth-service';
import { TwoFactorService } from '../../../security/two-factor/two-factor-service';
import {
  base32Decode,
  totpCode,
  totpStep
} from '../../../security/two-factor/utils/totp-util';
import { authUser } from '../../fixtures/server-fixture';

const ENCRYPTION_KEY = 'test-key';

type Row = {
  id: number;
  type: string;
  priority: number;
  secret?: string | null;
  confirmedAt?: Date | null;
  lastUsedStep?: number | null;
  updatedAt: Date;
  userId: number;
};

describe('two-factor-service', () => {
  let rows: Row[];
  let methodService: Record<string, any>;
  let authService: Record<string, jest.Mock>;
  let securityStore: Record<string, jest.Mock>;
  let tokens: Map<string, { purpose: string; data: any }>;
  let tokenCount: number;
  let sendEmail: jest.Mock;
  let sendSms: jest.Mock;
  let service: TwoFactorService;

  /** Creates the service with the given services defined, every one by default. */
  function createService({
    email = true,
    sms = true,
    methods = true
  } = {}): TwoFactorService {
    resetContext();
    define(authService, AuthService);
    define(securityStore, SecurityStore as any);
    define(LocaleService);
    if (email) {
      define({ sendEmail }, EmailService);
    }
    if (sms) {
      define({ sendSms }, SmsService);
    }

    const authUserService = {
      modelName: 'User',
      [RESOURCE_TYPE]: RESOURCE_SERVICE_TYPE,
      [RESOURCE_AUTH]: true,
      [RESOURCE_NAME]: 'User',
      [CONFIG]: {}
    };
    define(authUserService, 'User');
    context.resource.services.set('User', authUserService as any);
    if (methods) {
      context.resource.services.set('TwoFactorMethod', methodService as any);
    }

    return new TwoFactorService();
  }

  /** The user with the confirmed methods of the rows, as the auth service loads them. */
  const currentUser = (overrides: object = {}) =>
    authUser({
      verifiedEmail: true,
      twoFactorMethods: rows
        .filter((row) => row.confirmedAt)
        .sort((a, b) => a.priority - b.priority)
        .map((row) => row.type) as any,
      ...overrides
    });

  const addRow = (row: Partial<Row>) => {
    const added = {
      id: rows.length + 1,
      priority: 0,
      updatedAt: new Date(),
      userId: 1,
      ...row
    } as Row;
    rows.push(added);
    return added;
  };

  /** Adds a confirmed TOTP method with the given secret. */
  const addTotp = (secret: string, lastUsedStep: number | null = null) =>
    addRow({
      type: 'totp',
      secret: encryptText(secret, ENCRYPTION_KEY),
      confirmedAt: new Date(),
      lastUsedStep
    });

  const lastChallenge = () =>
    [...tokens.values()].findLast(
      (token) => token.purpose === (AuthOTTPurpose.TwoFAVerification as string)
    )!.data;

  beforeEach(() => {
    configOverrides.SECURITY_ACCOUNT_2FA_TOTP_ENCRYPTION_KEY = ENCRYPTION_KEY;
    rows = [];
    tokens = new Map();
    tokenCount = 0;

    methodService = {
      modelName: 'TwoFactorMethod',
      query: jest.fn(async ({ filter }) => ({
        items: rows.filter((row) => row.userId === filter.user)
      })),
      create: jest.fn(async (data) =>
        addRow({ ...data, userId: data.user.id, user: undefined })
      ),
      update: jest.fn(async (id, data) => {
        const row = rows.find((entry) => entry.id === id)!;
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
      client: {
        updateMany: jest.fn(async ({ where, data }) => {
          const row = rows.find((entry) => entry.id === where.id);
          if (!row || (row.lastUsedStep ?? -1) >= data.lastUsedStep) {
            return { count: 0 };
          }
          row.lastUsedStep = data.lastUsedStep;
          return { count: 1 };
        }),
        deleteMany: jest.fn(async ({ where }) => {
          rows = rows.filter((row) => row.id !== where.id);
          return { count: 1 };
        })
      }
    };

    authService = {
      findById: jest.fn(async () => currentUser()),
      evictCachedUsers: jest.fn()
    };

    // Stores the tokens and runs the validators the way the security stores do
    securityStore = {
      generateOneTimeToken: jest.fn(async (purpose, data) => {
        const token = `token-${++tokenCount}`;
        tokens.set(token, { purpose, data });
        return token;
      }),
      useOneTimeToken: jest.fn(async (token, purpose, validate) => {
        const stored = tokens.get(token);
        if (!stored || stored.purpose !== purpose) {
          throw new AuthError(ErrorCode.AuthInvalidToken, 'Invalid token');
        }
        const result = validate?.(stored.data);
        if (result && !result.valid) {
          if (result.revoke) {
            tokens.delete(token);
          } else if (result.data) {
            stored.data = result.data;
          }
          throw (
            result.error ?? new AuthError(ErrorCode.AuthInvalidToken, 'Invalid')
          );
        }
        tokens.delete(token);
        return stored.data;
      })
    };

    sendEmail = jest.fn().mockResolvedValue(undefined);
    sendSms = jest.fn().mockResolvedValue(undefined);

    service = createService();
  });

  afterEach(() => {
    for (const key of Object.keys(configOverrides)) {
      if (key.startsWith('SECURITY_ACCOUNT_2FA')) {
        delete configOverrides[key];
      }
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('availableMethods', () => {
    test('offers every method with its service', () => {
      expect(service.availableMethods()).toEqual(['email', 'sms', 'totp']);
    });

    test('leaves out the methods without their service', () => {
      delete configOverrides.SECURITY_ACCOUNT_2FA_TOTP_ENCRYPTION_KEY;

      expect(
        createService({ email: false, sms: false }).availableMethods()
      ).toEqual([]);
    });

    test('offers only the configured methods, in their order', () => {
      configOverrides.SECURITY_ACCOUNT_2FA_METHODS = ['totp', 'email'];

      expect(service.availableMethods()).toEqual(['totp', 'email']);
    });

    test('offers no method with 2FA disabled', () => {
      configOverrides.SECURITY_ACCOUNT_2FA_ENABLED = false;

      expect(service.availableMethods()).toEqual([]);
    });
  });

  describe('listMethods', () => {
    test('lists the enabled and the available methods', () => {
      expect(
        service.listMethods(authUser({ twoFactorMethods: ['sms'] }))
      ).toEqual({ enabled: ['sms'], available: ['email', 'sms', 'totp'] });
      expect(service.listMethods(authUser()).enabled).toEqual([]);
    });
  });

  describe('sendChallenge', () => {
    test('emails a code with the default method of the user', async () => {
      addRow({ type: 'email', confirmedAt: new Date() });

      const challenge = await service.sendChallenge(currentUser());

      const email = sendEmail.mock.calls[0][0];
      expect(email.to).toBe('user@test.com');
      expect(email.text).toMatch(/following code to continue:\n\n\d{6}\n/);
      const code = email.text.match(/\n\n(\d{6})\n\n/)[1];
      expect(lastChallenge()).toEqual({
        authUserId: 1,
        method: 'email',
        purpose: AuthOTTPurpose.Authentication,
        authSource: AuthSource.Password,
        codeHash: makeHash(code),
        attempts: 0
      });
      expect(challenge).toEqual({
        challengeId: 'token-1',
        expiresIn: 300000,
        method: 'email',
        destination: 'u***@test.com',
        methods: ['email']
      });
    });

    test('texts a code with the requested method', async () => {
      addRow({ type: 'email', confirmedAt: new Date(), priority: 0 });
      addRow({ type: 'sms', confirmedAt: new Date(), priority: 1 });

      const challenge = await service.sendChallenge(
        currentUser({ phoneNumber: '+385911234567', verifiedPhone: true }),
        { method: 'sms', authSource: AuthSource.OAuth2Google, locale: 'en' }
      );

      expect(sendEmail).not.toHaveBeenCalled();
      expect(sendSms).toHaveBeenCalledWith({
        to: '+385911234567',
        text: expect.stringMatching(
          /^\d{6} is your .+ verification code\. It expires in 5 minutes\.$/
        )
      });
      expect(lastChallenge().authSource).toBe(AuthSource.OAuth2Google);
      expect(challenge).toMatchObject({
        method: 'sms',
        destination: '+385*******67',
        methods: ['email', 'sms']
      });
    });

    test('waits for the code of the authenticator app', async () => {
      addTotp('JBSWY3DPEHPK3PXP');

      const challenge = await service.sendChallenge(currentUser());

      expect(sendEmail).not.toHaveBeenCalled();
      expect(sendSms).not.toHaveBeenCalled();
      expect(lastChallenge().codeHash).toBeUndefined();
      expect(challenge).toMatchObject({ method: 'totp', destination: null });
    });

    test('challenges with the default method when 2FA is forced', async () => {
      configOverrides.SECURITY_ACCOUNT_2FA_FORCED = true;

      const challenge = await service.sendChallenge(currentUser());

      expect(challenge.method).toBe('email');
      expect(sendEmail).toHaveBeenCalled();
    });

    test('keeps a custom purpose', async () => {
      addRow({ type: 'email', confirmedAt: new Date() });

      await service.sendChallenge(currentUser(), { purpose: 'payout' });

      expect(lastChallenge().purpose).toBe('payout');
    });

    test.each([
      AuthOTTPurpose.EmailVerification,
      AuthOTTPurpose.PasswordReset,
      AuthOTTPurpose.PhoneVerification
    ])('rejects the reserved purpose %p', async (purpose) => {
      addRow({ type: 'email', confirmedAt: new Date() });

      await expect(
        service.sendChallenge(currentUser(), { purpose })
      ).rejects.toMatchObject({
        code: ErrorCode.ValidationFailed,
        details: { errors: [expect.objectContaining({ field: 'purpose' })] }
      });
    });

    test('rejects a method the application does not offer', async () => {
      addRow({ type: 'sms', confirmedAt: new Date() });
      service = createService({ sms: false });

      await expect(
        service.sendChallenge(currentUser(), { method: 'sms' })
      ).rejects.toMatchObject({
        code: ErrorCode.Account2FAMethodUnavailable,
        details: { method: 'sms', availableMethods: ['email', 'totp'] }
      });
    });

    test('rejects a method the user has not enabled', async () => {
      addRow({ type: 'email', confirmedAt: new Date() });

      await expect(
        service.sendChallenge(currentUser(), { method: 'totp' })
      ).rejects.toMatchObject({
        code: ErrorCode.Account2FAMethodNotEnabled,
        details: { method: 'totp', enabledMethods: ['email'] }
      });
    });

    test('rejects a user without methods', async () => {
      await expect(service.sendChallenge(currentUser())).rejects.toMatchObject({
        code: ErrorCode.Account2FAMethodNotEnabled,
        message: 'The user has no 2FA method enabled',
        details: { enabledMethods: [] }
      });
    });

    test('rejects an SMS code without a verified phone number', async () => {
      addRow({ type: 'sms', confirmedAt: new Date() });

      await expect(
        service.sendChallenge(
          currentUser({ phoneNumber: '+385911234567', verifiedPhone: false })
        )
      ).rejects.toMatchObject({ code: ErrorCode.AccountPhoneNotVerified });
    });
  });

  describe('verifyChallenge', () => {
    test('issues the token of the purpose for the sent code', async () => {
      addRow({ type: 'email', confirmedAt: new Date() });
      await service.sendChallenge(currentUser(), {
        authSource: AuthSource.OAuth2Github
      });
      const code = sendEmail.mock.calls[0][0].text.match(/\n\n(\d{6})\n\n/)[1];

      const result = await service.verifyChallenge(
        currentUser(),
        'token-1',
        code
      );

      expect(result).toEqual({ token: 'token-2', expiresIn: 120000 });
      expect(tokens.get('token-2')).toEqual({
        purpose: AuthOTTPurpose.Authentication,
        data: {
          authUserId: 1,
          authSource: AuthSource.OAuth2Github,
          twoFactorVerified: true
        }
      });
    });

    test('counts the wrong codes and revokes the challenge on the last one', async () => {
      configOverrides.SECURITY_ACCOUNT_2FA_MAX_ATTEMPTS = 2;
      addRow({ type: 'email', confirmedAt: new Date() });
      await service.sendChallenge(currentUser());

      await expect(
        service.verifyChallenge(currentUser(), 'token-1', 'wrong')
      ).rejects.toMatchObject({
        code: ErrorCode.Account2FACodeInvalid,
        details: { attemptsLeft: 1 }
      });
      await expect(
        service.verifyChallenge(currentUser(), 'token-1', 'wrong')
      ).rejects.toMatchObject({ code: ErrorCode.Account2FATooManyAttempts });
      expect(tokens.has('token-1')).toBe(false);
    });

    test('rejects the challenge of another user', async () => {
      addRow({ type: 'email', confirmedAt: new Date() });
      await service.sendChallenge(currentUser());
      const code = sendEmail.mock.calls[0][0].text.match(/\n\n(\d{6})\n\n/)[1];

      await expect(
        service.verifyChallenge(currentUser({ id: 2 }), 'token-1', code)
      ).rejects.toMatchObject({ code: ErrorCode.AuthInvalidToken });
      expect(tokens.has('token-1')).toBe(true);
    });

    test('accepts a code of the authenticator app once', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const row = addTotp(secret);
      const code = totpCode(secret, totpStep());

      await service.sendChallenge(currentUser());
      await expect(
        service.verifyChallenge(currentUser(), 'token-1', code)
      ).resolves.toMatchObject({ token: 'token-2' });
      expect(row.lastUsedStep).toBe(totpStep());

      await service.sendChallenge(currentUser());
      await expect(
        service.verifyChallenge(currentUser(), 'token-3', code)
      ).rejects.toMatchObject({ code: ErrorCode.Account2FACodeInvalid });
    });

    test('rejects a code of the app used by a concurrent verification', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      addTotp(secret);
      methodService.client.updateMany.mockResolvedValue({ count: 0 });

      await service.sendChallenge(currentUser());

      await expect(
        service.verifyChallenge(
          currentUser(),
          'token-1',
          totpCode(secret, totpStep())
        )
      ).rejects.toMatchObject({
        code: ErrorCode.Account2FACodeInvalid,
        message: 'The code was already used'
      });
    });

    test('rejects a code of the app with a secret it cannot decrypt', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      addTotp(secret);
      await service.sendChallenge(currentUser());
      configOverrides.SECURITY_ACCOUNT_2FA_TOTP_ENCRYPTION_KEY = 'other';

      await expect(
        service.verifyChallenge(
          currentUser(),
          'token-1',
          totpCode(secret, totpStep())
        )
      ).rejects.toMatchObject({ code: ErrorCode.Account2FACodeInvalid });
    });

    test('rejects a code of the app without the TOTP method', async () => {
      addTotp('JBSWY3DPEHPK3PXP');
      await service.sendChallenge(currentUser());

      await expect(
        service.verifyChallenge(
          currentUser({ twoFactorMethods: ['email'] }),
          'token-1',
          '123456'
        )
      ).rejects.toMatchObject({ code: ErrorCode.Account2FACodeInvalid });
    });
  });

  describe('enableMethod', () => {
    test('enables the email method as the last one', async () => {
      addTotp('JBSWY3DPEHPK3PXP');

      await expect(
        service.enableMethod(currentUser(), 'email')
      ).resolves.toEqual(['totp', 'email']);

      expect(rows[1]).toMatchObject({ type: 'email', priority: 1 });
      expect(authService.evictCachedUsers).toHaveBeenCalled();
    });

    test('enables the SMS method with a verified phone number', async () => {
      await expect(
        service.enableMethod(
          currentUser({ phoneNumber: '+385911234567', verifiedPhone: true }),
          'sms'
        )
      ).resolves.toEqual(['sms']);
    });

    test('rejects the TOTP method, enabled by its setup', async () => {
      await expect(
        service.enableMethod(currentUser(), 'totp')
      ).rejects.toMatchObject({ code: ErrorCode.Account2FAMethodUnavailable });
    });

    test('rejects a method the application does not offer', async () => {
      await expect(
        createService({ sms: false }).enableMethod(currentUser(), 'sms')
      ).rejects.toMatchObject({ code: ErrorCode.Account2FAMethodUnavailable });
    });

    test('rejects an enabled method', async () => {
      addRow({ type: 'email', confirmedAt: new Date() });

      await expect(
        service.enableMethod(currentUser(), 'email')
      ).rejects.toMatchObject({
        code: ErrorCode.Account2FAMethodAlreadyEnabled
      });
    });

    test('rejects the email method without a verified email', async () => {
      await expect(
        service.enableMethod(currentUser({ verifiedEmail: false }), 'email')
      ).rejects.toMatchObject({ code: ErrorCode.AccountEmailNotVerified });
    });

    test('rejects the SMS method without a verified phone number', async () => {
      await expect(
        service.enableMethod(currentUser(), 'sms')
      ).rejects.toMatchObject({ code: ErrorCode.AccountPhoneNotVerified });
    });

    test('is not supported without the TwoFactorMethod model', async () => {
      await expect(
        createService({ methods: false }).enableMethod(currentUser(), 'email')
      ).rejects.toMatchObject({ code: ErrorCode.AccountFeatureUnavailable });
    });
  });

  describe('setupTotp', () => {
    test('stores the encrypted secret of a pending method', async () => {
      configOverrides.SECURITY_ACCOUNT_2FA_TOTP_ISSUER = 'Acme';

      const setup = await service.setupTotp(currentUser());

      expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(base32Decode(setup.secret)).toHaveLength(20);
      expect(setup.otpauthUrl).toBe(
        `otpauth://totp/Acme:user%40test.com?secret=${setup.secret}&issuer=Acme&algorithm=SHA1&digits=6&period=30`
      );
      expect(setup.expiresIn).toBe(600000);
      expect(rows[0]).toMatchObject({ type: 'totp' });
      expect(rows[0].confirmedAt).toBeUndefined();
      expect(decryptText(rows[0].secret!, ENCRYPTION_KEY)).toBe(setup.secret);
    });

    test('replaces the secret of a pending setup', async () => {
      const first = await service.setupTotp(currentUser());
      const second = await service.setupTotp(currentUser());

      expect(rows).toHaveLength(1);
      expect(second.secret).not.toBe(first.secret);
      expect(decryptText(rows[0].secret!, ENCRYPTION_KEY)).toBe(second.secret);
    });

    test('rejects an enabled TOTP method', async () => {
      addTotp('JBSWY3DPEHPK3PXP');

      await expect(service.setupTotp(currentUser())).rejects.toMatchObject({
        code: ErrorCode.Account2FAMethodAlreadyEnabled
      });
    });

    test('is unavailable without an encryption key', async () => {
      delete configOverrides.SECURITY_ACCOUNT_2FA_TOTP_ENCRYPTION_KEY;

      await expect(service.setupTotp(currentUser())).rejects.toMatchObject({
        code: ErrorCode.Account2FAMethodUnavailable
      });
    });
  });

  describe('confirmTotp', () => {
    test('enables the TOTP method with a code of the app', async () => {
      addRow({ type: 'email', confirmedAt: new Date() });
      const { secret } = await service.setupTotp(currentUser());

      await expect(
        service.confirmTotp(currentUser(), totpCode(secret, totpStep()))
      ).resolves.toEqual(['email', 'totp']);

      expect(rows[1]).toMatchObject({
        type: 'totp',
        priority: 1,
        lastUsedStep: totpStep()
      });
      expect(rows[1].confirmedAt).toBeInstanceOf(Date);
    });

    test('rejects a wrong code', async () => {
      await service.setupTotp(currentUser());

      await expect(
        service.confirmTotp(currentUser(), '000000')
      ).rejects.toMatchObject({ code: ErrorCode.Account2FACodeInvalid });
    });

    test('rejects without a setup', async () => {
      await expect(
        service.confirmTotp(currentUser(), '000000')
      ).rejects.toMatchObject({ code: ErrorCode.AuthInvalidToken });
    });

    test('rejects an expired setup', async () => {
      const { secret } = await service.setupTotp(currentUser());
      rows[0].updatedAt = new Date(Date.now() - 600001);

      await expect(
        service.confirmTotp(currentUser(), totpCode(secret, totpStep()))
      ).rejects.toMatchObject({
        code: ErrorCode.AuthInvalidToken,
        message: 'No TOTP setup to confirm, or it expired'
      });
    });

    test('rejects an enabled TOTP method', async () => {
      addTotp('JBSWY3DPEHPK3PXP');

      await expect(
        service.confirmTotp(currentUser(), '000000')
      ).rejects.toMatchObject({
        code: ErrorCode.Account2FAMethodAlreadyEnabled
      });
    });
  });

  describe('orderMethods', () => {
    test('orders the methods, the first becoming the default', async () => {
      addRow({ type: 'email', confirmedAt: new Date(), priority: 0 });
      addRow({ type: 'sms', confirmedAt: new Date(), priority: 1 });

      await expect(
        service.orderMethods(currentUser(), ['sms', 'email'])
      ).resolves.toEqual(['sms', 'email']);

      expect(rows.map((row) => [row.type, row.priority])).toEqual([
        ['email', 1],
        ['sms', 0]
      ]);
      expect(authService.evictCachedUsers).toHaveBeenCalled();
    });

    test.each([[['email']], [['email', 'email']], [['email', 'totp']]])(
      'rejects the order %p of other methods than the enabled ones',
      async (methods) => {
        addRow({ type: 'email', confirmedAt: new Date(), priority: 0 });
        addRow({ type: 'sms', confirmedAt: new Date(), priority: 1 });

        await expect(
          service.orderMethods(currentUser(), methods as any)
        ).rejects.toMatchObject({
          code: ErrorCode.Account2FAMethodNotEnabled,
          details: { enabledMethods: ['email', 'sms'] }
        });
      }
    );
  });

  describe('disableMethod', () => {
    test('deletes the method of a user confirming the password', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');
      addRow({ type: 'email', confirmedAt: new Date() });

      await expect(
        service.disableMethod(
          currentUser({ passwordHash }),
          'email',
          'Str0ng!Pass'
        )
      ).resolves.toEqual([]);

      expect(rows).toEqual([]);
      expect(authService.evictCachedUsers).toHaveBeenCalled();
    });

    test('deletes the method of a user without a password', async () => {
      addRow({ type: 'email', confirmedAt: new Date() });

      await expect(
        service.disableMethod(currentUser(), 'email')
      ).resolves.toEqual([]);
    });

    test('requires the password of a user who has one', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');
      addRow({ type: 'email', confirmedAt: new Date() });

      await expect(
        service.disableMethod(currentUser({ passwordHash }), 'email')
      ).rejects.toMatchObject({ code: ErrorCode.AuthPasswordRequired });
      await expect(
        service.disableMethod(currentUser({ passwordHash }), 'email', 'wrong')
      ).rejects.toMatchObject({ code: ErrorCode.AuthInvalidCredentials });
      expect(rows).toHaveLength(1);
    });

    test('rejects a method the user has not enabled', async () => {
      await service.setupTotp(currentUser());

      await expect(
        service.disableMethod(currentUser(), 'totp')
      ).rejects.toMatchObject({ code: ErrorCode.Account2FAMethodNotEnabled });
    });
  });

  describe('removeSmsMethod', () => {
    test('removes the SMS method of the user', async () => {
      addRow({ type: 'sms', confirmedAt: new Date() });

      await expect(service.removeSmsMethod(currentUser())).resolves.toBe(true);
      expect(rows).toEqual([]);
    });

    test('does nothing without an SMS method', async () => {
      await expect(service.removeSmsMethod(currentUser())).resolves.toBe(false);
    });

    test('does nothing without the TwoFactorMethod model', async () => {
      await expect(
        createService({ methods: false }).removeSmsMethod(currentUser())
      ).resolves.toBe(false);
    });
  });

  describe('database errors', () => {
    test('wraps the errors of the method queries', async () => {
      methodService.query.mockRejectedValue(prismaError('P2010', 'db down'));

      await expect(service.setupTotp(currentUser())).rejects.toMatchObject({
        code: ErrorCode.DatabaseOperationFailed
      });
    });
  });
});
