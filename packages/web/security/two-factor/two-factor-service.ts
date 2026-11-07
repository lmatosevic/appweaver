import {
  AccountError,
  appConfig,
  AuthError,
  AuthOTTPurpose,
  AuthSource,
  AuthUser,
  createLogger,
  decryptText,
  encryptText,
  ErrorCode,
  makeHash,
  RequestError,
  ResourceId,
  SecurityStore,
  TwoFactorChallengeMethod,
  TwoFactorMethodType,
  uncapitalize
} from '@appweaver/common';
import {
  EmailService,
  inject,
  injectService,
  SmsService
} from '@appweaver/core';
import {
  checkPassword,
  resourceAuthService,
  runTransaction,
  toDatabaseError,
  TwoFactorMethod,
  TwoFactorMethodResourceService,
  TwoFactorRecoveryCodeResourceService
} from '@appweaver/data';
import {
  recoveryCodesConfig,
  securityConfig,
  totpConfig,
  twoFactorConfig
} from '../security-config';
import { AuthService } from '../auth-service';
import { sendAccountEmail } from '../account/utils/account-email';
import { sendAccountSms } from '../account/utils/account-sms';
import { AuthOTTData, TwoFactorChallengeData } from '../../types/http-auth';
import {
  codeChallengeValidator,
  generateCode,
  maskEmail,
  maskPhoneNumber,
  matchesCodeHash
} from './utils/code-util';
import { effectiveTwoFactorMethods } from './utils/method-util';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode
} from './utils/recovery-code-util';
import { generateTotpSecret, totpUri, verifyTotp } from './utils/totp-util';

const logger = createLogger('security');

/** The one-time token purposes of the framework a 2FA challenge never issues, so it cannot verify an email or reset
 * a password. */
const reservedPurposes: string[] = Object.values(AuthOTTPurpose).filter(
  (purpose) => purpose !== AuthOTTPurpose.Authentication
);

/** The challenge method of the recovery codes, never a method a user enables. */
const RECOVERY = 'Recovery';

export type TwoFactorChallenge = {
  challengeId: string;
  expiresIn: number;
  method: TwoFactorChallengeMethod;
  /** The masked email address or phone number the code was sent to, `null` for an authenticator app or a recovery
   * code. */
  destination: string | null;
  /** The methods of the user, the first being the default. */
  methods: TwoFactorMethodType[];
};

export type TwoFactorMethods = {
  /** The confirmed methods of the user, the first being the default. */
  enabled: TwoFactorMethodType[];
  /** The methods the user may enable. */
  available: TwoFactorMethodType[];
};

export type RecoveryCodes = {
  /** The codes, shown once, each used once instead of a 2FA code. */
  codes: string[];
  generatedAt: Date;
};

export type TotpSetup = {
  /** The secret in Base32, for entering it in an authenticator app by hand. */
  secret: string;
  /** The `otpauth://` URI of the secret, for a QR code. */
  otpauthUrl: string;
  /** The time to confirm the setup with a first code, in milliseconds. */
  expiresIn: number;
};

/**
 * The two-factor authentication: the challenges of a signed-in user by email, SMS or an authenticator app (TOTP), and
 * the methods a user enables, orders and disables.
 */
export class TwoFactorService {
  /** @internal */
  private readonly _authService = inject(AuthService);
  /** @internal */
  private readonly _securityStore = inject(SecurityStore);
  /** @internal */
  private readonly _emailService = inject(EmailService, false);
  /** @internal */
  private readonly _smsService = inject(SmsService, false);
  /** @internal */
  private readonly _authUserService = resourceAuthService()!;
  /** Optional, since an application with 2FA disabled has no methods.
   * @internal */
  private readonly _methodService = injectService('TwoFactorMethod', false) as
    | TwoFactorMethodResourceService
    | undefined;
  /** @internal */
  private readonly _recoveryCodeService = injectService(
    'TwoFactorRecoveryCode',
    false
  ) as TwoFactorRecoveryCodeResourceService | undefined;

  /**
   * Returns the methods users may enable: the ones of the `methods` config whose service is available, a mailer for
   * `Email`, an SMS sender for `Sms`, and the `totp.encryptionKey` config for `Totp`.
   *
   * @return {TwoFactorMethodType[]} The available methods, in the order of the config.
   */
  public availableMethods(): TwoFactorMethodType[] {
    if (!twoFactorConfig.ENABLED) {
      return [];
    }

    return twoFactorConfig.METHODS.filter((method) => {
      switch (method) {
        case TwoFactorMethodType.Email:
          return !!this._emailService;
        case TwoFactorMethodType.Sms:
          return !!this._smsService;
        case TwoFactorMethodType.Totp:
          return !!totpConfig.ENCRYPTION_KEY;
        default:
          return false;
      }
    });
  }

  /**
   * Lists the methods of a user and the ones they may enable.
   *
   * @param {AuthUser} authUser - The user.
   * @return {TwoFactorMethods} The enabled and the available methods.
   */
  public listMethods(authUser: AuthUser): TwoFactorMethods {
    return {
      enabled: (authUser.twoFactorMethods ?? []) as TwoFactorMethodType[],
      available: this.availableMethods()
    };
  }

  /**
   * Starts a 2FA challenge of a signed-in user, sending a code by email or SMS, or waiting for the code of the
   * authenticator app or for one of the recovery codes of the user (the `Recovery` method). Without a method, the
   * default one of the user is used.
   *
   * @param {AuthUser} authUser - The user to challenge.
   * @param {Object} [options] - The `method` to verify with, the `purpose` of the one-time token issued when the
   * challenge is passed (`authentication` by default, exchanged for the tokens of the `auth` scope), the `authSource`
   * the user signed in with, and the `locale` of the message.
   * @return {Promise<TwoFactorChallenge>} The challenge, with where the code was sent.
   * @throws {RequestError} `VALIDATION_FAILED` for a purpose reserved to the framework.
   * @throws {AccountError} `ACCOUNT_2FA_METHOD_UNAVAILABLE` for a method this application does not offer,
   * `ACCOUNT_2FA_METHOD_NOT_ENABLED` for one the user has not enabled, `ACCOUNT_PHONE_NOT_VERIFIED` for an SMS code
   * without a verified phone number, and `ACCOUNT_2FA_METHOD_NOT_ENABLED` for the `Recovery` method of a user without
   * an unused recovery code.
   */
  public async sendChallenge(
    authUser: AuthUser,
    options: {
      method?: TwoFactorChallengeMethod;
      purpose?: string;
      authSource?: AuthSource;
      locale?: string;
    } = {}
  ): Promise<TwoFactorChallenge> {
    const purpose = options.purpose ?? AuthOTTPurpose.Authentication;
    if (reservedPurposes.includes(purpose)) {
      throw new RequestError(
        ErrorCode.ValidationFailed,
        `The 2FA purpose '${purpose}' is reserved`,
        {
          errors: [
            {
              field: 'purpose',
              rule: 'reserved',
              message: `The purpose '${purpose}' is reserved by the framework`,
              pointer: '#/body/purpose'
            }
          ]
        }
      );
    }

    const methods = effectiveTwoFactorMethods(authUser);
    const method: TwoFactorChallengeMethod =
      options.method === RECOVERY
        ? await this.checkRecoveryCodes(authUser)
        : this.checkMethod(
            authUser,
            (options.method ?? methods[0]) as TwoFactorMethodType | undefined
          );

    const expiresIn = twoFactorConfig.OTT_TTL;
    const code =
      method === 'Email' || method === 'Sms' ? generateCode() : undefined;

    const challengeId =
      await this._securityStore.generateOneTimeToken<TwoFactorChallengeData>(
        AuthOTTPurpose.TwoFAVerification,
        {
          authUserId: authUser.id,
          method,
          purpose,
          authSource: options.authSource ?? AuthSource.Password,
          codeHash: code ? makeHash(code) : undefined,
          attempts: 0
        },
        expiresIn
      );

    let destination: string | null = null;
    if (method === 'Email') {
      await this.sendEmailCode(authUser, code!, purpose, options.locale);
      destination = maskEmail(authUser.email);
    } else if (method === 'Sms') {
      await this.sendSmsCode(authUser.phoneNumber!, code!, options.locale);
      destination = maskPhoneNumber(authUser.phoneNumber!);
    }

    logger.debug(
      { id: authUser.id, method, challengeId },
      '2FA challenge sent'
    );

    return { challengeId, expiresIn, method, destination, methods };
  }

  /**
   * Verifies the code of a 2FA challenge of the user, issuing the one-time token of its purpose. A wrong code counts
   * against the `maxAttempts` of the challenge. A recovery code is used up, and the user is emailed about it unless
   * `recoveryCodes.notifyOnUse` is off.
   *
   * @param {AuthUser} authUser - The user the challenge was sent to.
   * @param {string} challengeId - The id of the challenge.
   * @param {string} code - The code entered by the user.
   * @return {Promise<{ token: string; expiresIn: number }>} The one-time token, i.e. for `/exchange-token`.
   * @throws {AuthError} `AUTH_INVALID_TOKEN` for an expired challenge or the one of another user.
   * @throws {AccountError} `ACCOUNT_2FA_CODE_INVALID` for a wrong code, `ACCOUNT_2FA_TOO_MANY_ATTEMPTS` for the last
   * wrong code allowed, which revokes the challenge.
   */
  public async verifyChallenge(
    authUser: AuthUser,
    challengeId: string,
    code: string
  ): Promise<{ token: string; expiresIn: number }> {
    const totpMethod = (authUser.twoFactorMethods ?? []).includes(
      TwoFactorMethodType.Totp
    )
      ? await this.findMethod(authUser, TwoFactorMethodType.Totp)
      : null;
    const recoveryCodeId = await this.findRecoveryCode(authUser, code);

    // Set by the validation, the time step of an accepted TOTP code
    const totp: { step: number | null } = { step: null };
    const data =
      await this._securityStore.useOneTimeToken<TwoFactorChallengeData>(
        challengeId,
        AuthOTTPurpose.TwoFAVerification,
        codeChallengeValidator(authUser.id, (challenge) => {
          if (challenge.method === RECOVERY) {
            return recoveryCodeId !== null;
          }
          if (
            (challenge.method as TwoFactorMethodType) !==
            TwoFactorMethodType.Totp
          ) {
            return matchesCodeHash(challenge.codeHash, code);
          }
          totp.step = totpMethod ? this.verifyTotpCode(totpMethod, code) : null;
          return totp.step !== null;
        })
      );

    if (totp.step !== null && totpMethod) {
      await this.useTotpStep(totpMethod, totp.step);
    }
    if (data.method === RECOVERY && recoveryCodeId !== null) {
      await this.useRecoveryCode(recoveryCodeId);
      await this.notifyRecoveryCodeUsed(authUser);
    }

    const expiresIn = securityConfig.AUTH_OTT_TTL;
    const token = await this._securityStore.generateOneTimeToken<AuthOTTData>(
      data.purpose,
      {
        authUserId: authUser.id,
        authSource: data.authSource,
        twoFactorVerified: true
      },
      expiresIn
    );

    logger.debug(
      { id: authUser.id, method: data.method },
      '2FA challenge passed'
    );

    return { token, expiresIn };
  }

  /**
   * Enables the email or SMS method of a user, as their last one. The TOTP method is enabled with
   * {@link setupTotp} and {@link confirmTotp} instead.
   *
   * @param {AuthUser} authUser - The user.
   * @param {TwoFactorMethodType} method - The `Email` or `Sms` method.
   * @return {Promise<TwoFactorMethodType[]>} The enabled methods of the user.
   * @throws {AccountError} `ACCOUNT_2FA_METHOD_UNAVAILABLE` for a method this application does not offer or the
   * `Totp` one, `ACCOUNT_2FA_METHOD_ALREADY_ENABLED` for an enabled one, `ACCOUNT_EMAIL_NOT_VERIFIED` or
   * `ACCOUNT_PHONE_NOT_VERIFIED` without the verified address or number.
   */
  public async enableMethod(
    authUser: AuthUser,
    type: `${TwoFactorMethodType}`
  ): Promise<TwoFactorMethodType[]> {
    const method = type as TwoFactorMethodType;
    if (method === TwoFactorMethodType.Totp) {
      throw new AccountError(
        ErrorCode.Account2FAMethodUnavailable,
        'The TOTP method is enabled by its setup',
        { method, availableMethods: this.availableMethods() }
      );
    }
    this.checkAvailable(method);

    if ((authUser.twoFactorMethods ?? []).includes(method)) {
      throw new AccountError(
        ErrorCode.Account2FAMethodAlreadyEnabled,
        `The 2FA method '${method}' is already enabled`,
        { method }
      );
    }

    if (method === TwoFactorMethodType.Email && !authUser.verifiedEmail) {
      throw new AccountError(
        ErrorCode.AccountEmailNotVerified,
        'The email address must be verified to receive the 2FA codes'
      );
    }
    this.checkPhone(authUser, method);

    await this.saveMethod(authUser, {
      type: method,
      confirmedAt: new Date()
    });

    logger.debug({ id: authUser.id, method }, '2FA method enabled');

    return this.enabledMethods(authUser);
  }

  /**
   * Starts the setup of the TOTP method, generating the secret the user adds to their authenticator app. The method
   * is enabled once {@link confirmTotp} receives a first code, within the `totp.setupTtl`. A new setup replaces the
   * secret of an unconfirmed one.
   *
   * @param {AuthUser} authUser - The user.
   * @return {Promise<TotpSetup>} The secret and its `otpauth://` URI.
   * @throws {AccountError} `ACCOUNT_2FA_METHOD_UNAVAILABLE` if TOTP is not offered, `ACCOUNT_2FA_METHOD_ALREADY_ENABLED`
   * if it is enabled.
   */
  public async setupTotp(authUser: AuthUser): Promise<TotpSetup> {
    this.checkAvailable(TwoFactorMethodType.Totp);

    const existing = await this.findMethod(authUser, TwoFactorMethodType.Totp);
    if (existing?.confirmedAt) {
      throw new AccountError(
        ErrorCode.Account2FAMethodAlreadyEnabled,
        `The 2FA method '${TwoFactorMethodType.Totp}' is already enabled`,
        { method: TwoFactorMethodType.Totp }
      );
    }

    const secret = generateTotpSecret();
    const encrypted = encryptText(secret, totpConfig.ENCRYPTION_KEY!);

    if (existing) {
      await this.updateMethod(existing.id, {
        secret: encrypted,
        lastUsedStep: null
      });
    } else {
      await this.saveMethod(authUser, {
        type: TwoFactorMethodType.Totp,
        secret: encrypted
      });
    }

    logger.debug({ id: authUser.id }, 'TOTP setup started');

    return {
      secret,
      otpauthUrl: totpUri({
        secret,
        issuer: totpConfig.ISSUER ?? appConfig.NAME,
        account: authUser.email,
        digits: totpConfig.DIGITS,
        period: totpConfig.PERIOD
      }),
      expiresIn: totpConfig.SETUP_TTL
    };
  }

  /**
   * Confirms the TOTP setup of a user with a code of their authenticator app, enabling the method as their last one.
   *
   * @param {AuthUser} authUser - The user.
   * @param {string} code - The code of the authenticator app.
   * @return {Promise<TwoFactorMethodType[]>} The enabled methods of the user.
   * @throws {AuthError} `AUTH_INVALID_TOKEN` without a setup to confirm, or after its `totp.setupTtl`.
   * @throws {AccountError} `ACCOUNT_2FA_METHOD_ALREADY_ENABLED` if TOTP is enabled, `ACCOUNT_2FA_CODE_INVALID` for a
   * wrong code.
   */
  public async confirmTotp(
    authUser: AuthUser,
    code: string
  ): Promise<TwoFactorMethodType[]> {
    this.checkAvailable(TwoFactorMethodType.Totp);

    const method = await this.findMethod(authUser, TwoFactorMethodType.Totp);
    if (method?.confirmedAt) {
      throw new AccountError(
        ErrorCode.Account2FAMethodAlreadyEnabled,
        `The 2FA method '${TwoFactorMethodType.Totp}' is already enabled`,
        { method: TwoFactorMethodType.Totp }
      );
    }

    const startedAt = method && new Date(method.updatedAt).getTime();
    if (
      !method ||
      !startedAt ||
      startedAt + totpConfig.SETUP_TTL < Date.now()
    ) {
      throw new AuthError(
        ErrorCode.AuthInvalidToken,
        'No TOTP setup to confirm, or it expired'
      );
    }

    const step = this.verifyTotpCode(method, code);
    if (step === null) {
      throw new AccountError(
        ErrorCode.Account2FACodeInvalid,
        'Invalid code provided',
        { attemptsLeft: twoFactorConfig.MAX_ATTEMPTS }
      );
    }

    await this.updateMethod(method.id, {
      confirmedAt: new Date(),
      lastUsedStep: step,
      priority: await this.nextPriority(authUser)
    });
    await this._authService.evictCachedUsers(authUser);

    logger.debug({ id: authUser.id }, '2FA method enabled');

    return this.enabledMethods(authUser);
  }

  /**
   * Orders the methods of a user, the first one becoming their default.
   *
   * @param {AuthUser} authUser - The user.
   * @param {TwoFactorMethodType[]} methods - Every enabled method of the user, in the new order.
   * @return {Promise<TwoFactorMethodType[]>} The enabled methods of the user, in the new order.
   * @throws {AccountError} `ACCOUNT_2FA_METHOD_NOT_ENABLED` unless the methods are the enabled ones of the user, each
   * once.
   */
  public async orderMethods(
    authUser: AuthUser,
    methods: `${TwoFactorMethodType}`[]
  ): Promise<TwoFactorMethodType[]> {
    const enabled = (authUser.twoFactorMethods ?? []) as TwoFactorMethodType[];
    if (
      methods.length !== enabled.length ||
      new Set(methods).size !== methods.length ||
      methods.some((method) => !enabled.includes(method as TwoFactorMethodType))
    ) {
      throw new AccountError(
        ErrorCode.Account2FAMethodNotEnabled,
        'The order must list every enabled 2FA method once',
        { enabledMethods: enabled }
      );
    }

    for (const row of await this.findMethods(authUser)) {
      const priority = methods.indexOf(row.type);
      if (priority >= 0 && priority !== row.priority) {
        await this.updateMethod(row.id, { priority });
      }
    }
    await this._authService.evictCachedUsers(authUser);

    logger.debug({ id: authUser.id, methods }, '2FA methods ordered');

    return methods as TwoFactorMethodType[];
  }

  /**
   * Disables a method of a user, confirmed by the password of a user who has one. Without methods left, the user
   * signs in without 2FA, unless it is forced.
   *
   * @param {AuthUser} authUser - The user.
   * @param {TwoFactorMethodType} method - The method to disable.
   * @param {string} [password] - The password of the user.
   * @return {Promise<TwoFactorMethodType[]>} The remaining methods of the user.
   * @throws {AuthError} `AUTH_PASSWORD_REQUIRED` without the password of a user who has one, `AUTH_INVALID_CREDENTIALS`
   * for a wrong one.
   * @throws {AccountError} `ACCOUNT_2FA_METHOD_NOT_ENABLED` for a method the user has not enabled.
   */
  public async disableMethod(
    authUser: AuthUser,
    method: `${TwoFactorMethodType}`,
    password?: string
  ): Promise<TwoFactorMethodType[]> {
    await this.confirmPassword(authUser, password);

    const row = await this.findMethod(authUser, method);
    if (!row?.confirmedAt) {
      throw new AccountError(
        ErrorCode.Account2FAMethodNotEnabled,
        `The 2FA method '${method}' is not enabled`,
        { method, enabledMethods: authUser.twoFactorMethods ?? [] }
      );
    }

    await this.deleteMethod(authUser, row);

    logger.debug({ id: authUser.id, method }, '2FA method disabled');

    const enabled = await this.enabledMethods(authUser);
    // The recovery codes only stand in for the methods, so they go with the last one
    if (enabled.length === 0) {
      await this.deleteRecoveryCodes(authUser.id);
    }

    return enabled;
  }

  /**
   * Generates the recovery codes of a user, confirmed by the password of a user who has one, replacing the ones they
   * had. The codes are returned only here, the database keeps their hashes.
   *
   * @param {AuthUser} authUser - The user, with a 2FA method.
   * @param {string} [password] - The password of the user.
   * @return {Promise<RecoveryCodes>} The `recoveryCodes.count` new codes.
   * @throws {AuthError} `AUTH_PASSWORD_REQUIRED` without the password of a user who has one, `AUTH_INVALID_CREDENTIALS`
   * for a wrong one.
   * @throws {AccountError} `ACCOUNT_2FA_METHOD_UNAVAILABLE` with the recovery codes disabled,
   * `ACCOUNT_2FA_METHOD_NOT_ENABLED` for a user without a 2FA method.
   */
  public async generateRecoveryCodes(
    authUser: AuthUser,
    password?: string
  ): Promise<RecoveryCodes> {
    const service = this.recoveryCodeService();
    await this.confirmPassword(authUser, password);

    const methods = effectiveTwoFactorMethods(authUser);
    if (methods.length === 0) {
      throw new AccountError(
        ErrorCode.Account2FAMethodNotEnabled,
        'The recovery codes need a 2FA method',
        { method: RECOVERY, enabledMethods: methods }
      );
    }

    const codes = Array.from({ length: recoveryCodesConfig.COUNT }, () =>
      generateRecoveryCode(recoveryCodesConfig.LENGTH)
    );
    const foreignKey = this.authForeignKey();

    try {
      await runTransaction(async () => {
        await service.client.deleteMany({
          where: { [foreignKey]: authUser.id }
        });
        await service.client.createMany({
          data: codes.map((code) => ({
            codeHash: hashRecoveryCode(code),
            [foreignKey]: authUser.id
          }))
        });
      });
    } catch (e) {
      throw toDatabaseError(e);
    }

    logger.debug({ id: authUser.id }, '2FA recovery codes generated');

    return { codes, generatedAt: new Date() };
  }

  /**
   * Removes every 2FA method and recovery code of a user, i.e. by an administrator for a user who lost them all.
   * Without methods, the user signs in without 2FA, unless it is forced.
   *
   * @param {ResourceId} authUserId - The id of the user.
   * @return {Promise<void>} A promise that resolves once the methods and the codes are removed.
   */
  public async resetTwoFactor(authUserId: ResourceId): Promise<void> {
    const foreignKey = this.authForeignKey();
    try {
      await this._methodService?.client.deleteMany({
        where: { [foreignKey]: authUserId }
      });
    } catch (e) {
      throw toDatabaseError(e);
    }
    await this.deleteRecoveryCodes(authUserId);

    const authUser = await this._authService.findById(authUserId);
    await this._authService.evictCachedUsers(authUser ?? undefined);

    logger.debug({ id: authUserId }, '2FA reset');
  }

  /**
   * Removes the SMS method of a user whose phone number changed, so the codes are never sent to a number the user did
   * not choose for them. Does nothing without one.
   *
   * @param {AuthUser} authUser - The user.
   * @return {Promise<boolean>} Whether a method was removed.
   */
  public async removeSmsMethod(authUser: AuthUser): Promise<boolean> {
    if (!this._methodService) {
      return false;
    }

    const row = await this.findMethod(authUser, TwoFactorMethodType.Sms);
    if (!row) {
      return false;
    }

    await this.deleteMethod(authUser, row);

    logger.debug({ id: authUser.id }, '2FA SMS method removed');

    return true;
  }

  /**
   * Checks the password confirming a change of the 2FA of a user who has one.
   *
   * @internal
   */
  private async confirmPassword(
    authUser: AuthUser,
    password?: string
  ): Promise<void> {
    if (!authUser.passwordHash) {
      return;
    }
    if (!password) {
      throw new AuthError(
        ErrorCode.AuthPasswordRequired,
        'The password is required to change the 2FA of the user'
      );
    }
    if (!(await checkPassword(password, authUser.passwordHash))) {
      throw new AuthError(
        ErrorCode.AuthInvalidCredentials,
        'Invalid user credentials'
      );
    }
  }

  /**
   * Checks that a user can be challenged for a recovery code: the codes are enabled, and the user has an unused one.
   *
   * @internal
   */
  private async checkRecoveryCodes(authUser: AuthUser): Promise<'Recovery'> {
    const service = this.recoveryCodeService();

    let unused: number;
    try {
      unused = await service.client.count({
        where: { [this.authForeignKey()]: authUser.id, usedAt: null }
      });
    } catch (e) {
      throw toDatabaseError(e);
    }

    if (unused === 0) {
      throw new AccountError(
        ErrorCode.Account2FAMethodNotEnabled,
        'The user has no unused recovery code',
        {
          method: RECOVERY,
          enabledMethods: effectiveTwoFactorMethods(authUser)
        }
      );
    }

    return RECOVERY;
  }

  /**
   * Finds the unused recovery code of a user matching an entered code. Only a code of the length of the recovery codes
   * is looked up, so the other codes of a challenge need no query.
   *
   * @internal
   */
  private async findRecoveryCode(
    authUser: AuthUser,
    code: string
  ): Promise<ResourceId | null> {
    const service = this._recoveryCodeService;
    if (
      !service ||
      !recoveryCodesConfig.ENABLED ||
      normalizeRecoveryCode(code).length !== recoveryCodesConfig.LENGTH
    ) {
      return null;
    }

    try {
      const row = await service.client.findFirst({
        where: {
          [this.authForeignKey()]: authUser.id,
          codeHash: hashRecoveryCode(code),
          usedAt: null
        },
        select: { id: true }
      });
      return row?.id ?? null;
    } catch (e) {
      throw toDatabaseError(e);
    }
  }

  /**
   * Marks a recovery code as used, failing when a concurrent verification used it first.
   *
   * @internal
   */
  private async useRecoveryCode(id: ResourceId): Promise<void> {
    let count: number;
    try {
      ({ count } = await this.recoveryCodeService().client.updateMany({
        where: { id, usedAt: null },
        data: { usedAt: new Date() }
      }));
    } catch (e) {
      throw toDatabaseError(e);
    }

    if (count === 0) {
      throw new AccountError(
        ErrorCode.Account2FACodeInvalid,
        'The code was already used',
        { attemptsLeft: 0 }
      );
    }
  }

  /**
   * Emails the user about a used recovery code, without failing the sign-in when the email cannot be sent.
   *
   * @internal
   */
  private async notifyRecoveryCodeUsed(authUser: AuthUser): Promise<void> {
    logger.info({ id: authUser.id }, '2FA recovery code used');

    if (!recoveryCodesConfig.NOTIFY_ON_USE || !this._emailService) {
      return;
    }

    try {
      await sendAccountEmail(
        this._emailService,
        {
          to: authUser.email,
          template: 'emails/recovery-code-used',
          data: { email: authUser.email }
        },
        'emails.recoveryCodeUsed',
        (t) => [
          t('emails.recoveryCodeUsed.message'),
          t('emails.recoveryCodeUsed.advice')
        ]
      );
    } catch (e) {
      logger.warn({ id: authUser.id, err: e }, 'Recovery code email failed');
    }
  }

  /** @internal */
  private async deleteRecoveryCodes(authUserId: ResourceId): Promise<void> {
    try {
      await this._recoveryCodeService?.client.deleteMany({
        where: { [this.authForeignKey()]: authUserId }
      });
    } catch (e) {
      throw toDatabaseError(e);
    }
  }

  /**
   * Checks the method of a challenge: offered by the application, enabled for the user, and with a verified phone
   * number for SMS.
   *
   * @internal
   */
  private checkMethod(
    authUser: AuthUser,
    method: TwoFactorMethodType | undefined
  ): TwoFactorMethodType {
    const methods = effectiveTwoFactorMethods(authUser);

    if (method) {
      this.checkAvailable(method);
    }

    if (!method || !methods.includes(method)) {
      throw new AccountError(
        ErrorCode.Account2FAMethodNotEnabled,
        method
          ? `The 2FA method '${method}' is not enabled for the user`
          : 'The user has no 2FA method enabled',
        { method, enabledMethods: methods }
      );
    }

    this.checkPhone(authUser, method);

    return method;
  }

  /** @internal */
  private checkAvailable(method: TwoFactorMethodType | string): void {
    const availableMethods = this.availableMethods();
    if (!availableMethods.includes(method as TwoFactorMethodType)) {
      throw new AccountError(
        ErrorCode.Account2FAMethodUnavailable,
        `The 2FA method '${method}' is not available`,
        { method, availableMethods }
      );
    }
  }

  /** @internal */
  private checkPhone(authUser: AuthUser, method: TwoFactorMethodType): void {
    if (
      method === TwoFactorMethodType.Sms &&
      (!authUser.phoneNumber || !authUser.verifiedPhone)
    ) {
      throw new AccountError(
        ErrorCode.AccountPhoneNotVerified,
        'A verified phone number is required to receive the 2FA codes'
      );
    }
  }

  /** @internal */
  private async sendEmailCode(
    authUser: AuthUser,
    code: string,
    purpose: string,
    locale?: string
  ): Promise<void> {
    const expiresInMinutes = Math.ceil(twoFactorConfig.OTT_TTL / 60_000);

    await sendAccountEmail(
      this._emailService!,
      {
        to: authUser.email,
        template: 'emails/two-factor-code',
        data: { email: authUser.email, code, purpose, expiresInMinutes },
        locale
      },
      'emails.twoFactorCode',
      (t) => [
        t('emails.twoFactorCode.message'),
        code,
        t('emails.twoFactorCode.expires', { count: expiresInMinutes })
      ]
    );
  }

  /** @internal */
  private async sendSmsCode(
    phoneNumber: string,
    code: string,
    locale?: string
  ): Promise<void> {
    await sendAccountSms(
      this._smsService!,
      {
        to: phoneNumber,
        template: 'sms/two-factor-code',
        code,
        expiresInMinutes: Math.ceil(twoFactorConfig.OTT_TTL / 60_000),
        locale
      },
      'sms.twoFactorCode'
    );
  }

  /**
   * Verifies a code of the authenticator app, rejecting the one of a time step already used.
   *
   * @internal
   */
  private verifyTotpCode(method: TwoFactorMethod, code: string): number | null {
    const key = totpConfig.ENCRYPTION_KEY;
    if (!method.secret || !key) {
      return null;
    }

    let secret: string;
    try {
      secret = decryptText(method.secret, key);
    } catch (e) {
      logger.warn({ err: e }, 'TOTP secret could not be decrypted');
      return null;
    }

    const step = verifyTotp(secret, code, {
      digits: totpConfig.DIGITS,
      period: totpConfig.PERIOD,
      window: totpConfig.WINDOW
    });

    return step !== null && step > (method.lastUsedStep ?? -1) ? step : null;
  }

  /**
   * Records the time step of an accepted code, failing when a concurrent verification used the same one first.
   *
   * @internal
   */
  private async useTotpStep(
    method: TwoFactorMethod,
    step: number
  ): Promise<void> {
    let count: number;
    try {
      ({ count } = await this.methodService().client.updateMany({
        where: {
          id: method.id,
          OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }]
        },
        data: { lastUsedStep: step }
      }));
    } catch (e) {
      throw toDatabaseError(e);
    }

    if (count === 0) {
      throw new AccountError(
        ErrorCode.Account2FACodeInvalid,
        'The code was already used',
        { attemptsLeft: 0 }
      );
    }
  }

  /** @internal */
  private async findMethods(authUser: AuthUser): Promise<TwoFactorMethod[]> {
    try {
      return await this.methodService().client.findMany({
        where: { [this.authForeignKey()]: authUser.id }
      });
    } catch (e) {
      throw toDatabaseError(e);
    }
  }

  /** @internal */
  private async findMethod(
    authUser: AuthUser,
    type: `${TwoFactorMethodType}`
  ): Promise<TwoFactorMethod | null> {
    return (
      (await this.findMethods(authUser)).find(
        (method) => method.type === type
      ) ?? null
    );
  }

  /** @internal */
  private async saveMethod(
    authUser: AuthUser,
    data: {
      type: `${TwoFactorMethodType}`;
      secret?: string;
      confirmedAt?: Date;
    }
  ): Promise<void> {
    const priority = await this.nextPriority(authUser);
    try {
      await this.methodService().client.create({
        data: { ...data, priority, [this.authForeignKey()]: authUser.id }
      });
    } catch (e) {
      throw toDatabaseError(e);
    }
    await this._authService.evictCachedUsers(authUser);
  }

  /** @internal */
  private async updateMethod(
    id: ResourceId,
    data: Partial<TwoFactorMethod>
  ): Promise<void> {
    try {
      await this.methodService().client.update({ where: { id }, data });
    } catch (e) {
      throw toDatabaseError(e);
    }
  }

  /**
   * Deletes a method for good, also with a soft deleted auth model, so the user can enable it again.
   *
   * @internal
   */
  private async deleteMethod(
    authUser: AuthUser,
    method: TwoFactorMethod
  ): Promise<void> {
    try {
      await this.methodService().client.deleteMany({
        where: { id: method.id }
      });
    } catch (e) {
      throw toDatabaseError(e);
    }
    await this._authService.evictCachedUsers(authUser);
  }

  /** @internal */
  private async nextPriority(authUser: AuthUser): Promise<number> {
    const confirmed = (await this.findMethods(authUser)).filter(
      (method) => method.confirmedAt
    );
    return confirmed.reduce(
      (max, method) => Math.max(max, method.priority + 1),
      0
    );
  }

  /** @internal */
  private async enabledMethods(
    authUser: AuthUser
  ): Promise<TwoFactorMethodType[]> {
    const updated = await this._authService.findById(authUser.id);
    return (updated?.twoFactorMethods ?? []) as TwoFactorMethodType[];
  }

  /** @internal */
  private methodService(): TwoFactorMethodResourceService {
    if (!this._methodService) {
      throw new AccountError(
        ErrorCode.AccountFeatureUnavailable,
        '2FA is not supported',
        { feature: '2fa' }
      );
    }
    return this._methodService;
  }

  /** @internal */
  private recoveryCodeService(): TwoFactorRecoveryCodeResourceService {
    if (!this._recoveryCodeService || !recoveryCodesConfig.ENABLED) {
      throw new AccountError(
        ErrorCode.Account2FAMethodUnavailable,
        'The recovery codes are not available',
        { method: RECOVERY, availableMethods: this.availableMethods() }
      );
    }
    return this._recoveryCodeService;
  }

  /** The foreign key column of the auth model, i.e. `userId`.
   * @internal */
  private authForeignKey(): string {
    return `${uncapitalize(this._authUserService.modelName)}Id`;
  }
}
