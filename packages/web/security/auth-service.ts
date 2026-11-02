import { randomBytes } from 'node:crypto';
import {
  AuthOTTPurpose,
  AuthScope,
  AuthSource,
  AuthUser,
  CONFIG,
  ErrorCode,
  Events,
  createLogger,
  ResourceId,
  RouteConfig,
  SecurityStore,
  uncapitalize,
  AuthError,
  ContextError
} from '@appweaver/common';
import { jwtConfig, securityConfig } from './security-config';
import {
  passwordConfig,
  checkPassword,
  hashPassword,
  hasPermissions,
  hasRoles,
  needsRehash,
  resourceAuthService,
  validatePasswordComplexity,
  FileService,
  toDatabaseError,
  withoutPolicies,
  RegistrationDataFn,
  RegistrationFiles,
  RegistrationFilesFn,
  UserAdditionalData,
  TwoFactorMethod,
  TwoFactorMethodResourceService
} from '@appweaver/data';
import {
  cacheConfig,
  currentAuthSource,
  inject,
  injectCreated,
  injectService,
  CacheService
} from '@appweaver/core';
import { checkScopeAccess } from './access-util';
import {
  effectiveTwoFactorMethods,
  isTwoFactorRequired
} from './two-factor/utils/method-util';
import { OAuth2Service } from './oauth2/oauth2-service';
import type { HttpServer } from '../server/http-server';
import { AuthOTTData, AuthTokens, JwtPayload } from '../types/http-auth';

const logger = createLogger('security');

const AUTH_KEY = 'auth';

/** Checked when the user has no password hash, so the response time does not reveal which users exist. Created on
 * first use, with the same cost as every other password hash. */
let timingGuardHash: Promise<string> | undefined;

export class AuthService {
  /** @internal */
  private readonly _securityStore = inject(SecurityStore);
  /** @internal */
  private readonly _cacheService = inject(CacheService);
  /** @internal */
  private readonly _authUserService = resourceAuthService()!;
  /** Optional, since an application with no OAuth2 provider never registers it.
   * @internal */
  private readonly _oauth2Service = inject(OAuth2Service, false);
  /** @internal */
  private readonly _events = inject(Events);
  /** Optional, since an application with 2FA disabled has no methods.
   * @internal */
  private readonly _twoFactorMethodService = injectService(
    'TwoFactorMethod',
    false
  ) as TwoFactorMethodResourceService | undefined;

  constructor() {
    // Evicts the users changed outside of this service as well, e.g. through
    // the resource routes, regardless of the cache invalidation strategy
    const modelName = this._authUserService.modelName;
    this._events.onResourceEvent<AuthUser>(
      modelName,
      'update',
      ({ previous, current }) => this.evictCachedUsers(previous, current)
    );
    this._events.onResourceEvent<AuthUser>(modelName, 'delete', ({ current }) =>
      this.evictCachedUsers(current)
    );
  }

  /**
   * Finds an authenticated user by their unique identifier.
   *
   * @param {ResourceId} id - The unique identifier of the authenticated user to find.
   * @return {Promise<AuthUser | null>} A promise that resolves to the authenticated user object if found, otherwise
   * null.
   */
  public async findById(id: ResourceId): Promise<AuthUser | null> {
    try {
      if (!cacheConfig.ENABLED || securityConfig.CACHE_TTL < 0) {
        return await this.withTwoFactorMethods(
          await withoutPolicies(() => this._authUserService.find(id))
        );
      }

      const cacheKey = this.authCacheKey(id);

      const value = await this._cacheService.getCachedValue<AuthUser>(cacheKey);
      if (value) {
        return value;
      }

      const authUser = await this.withTwoFactorMethods(
        await withoutPolicies(() => this._authUserService.find(id))
      );

      await this._cacheService.addToCache(
        cacheKey,
        authUser,
        securityConfig.CACHE_TTL
      );

      return authUser;
    } catch (e) {
      throw toDatabaseError(e);
    }
  }

  /**
   * Retrieves a user by their username.
   *
   * @param {string} username - The username to search for.
   * @return {Promise<AuthUser | null>} A promise that resolves to the user object if found, or null if not found.
   */
  public async findByUsername(username: string): Promise<AuthUser | null> {
    try {
      if (!cacheConfig.ENABLED || securityConfig.CACHE_TTL < 0) {
        return await this.withTwoFactorMethods(
          await withoutPolicies(() =>
            this._authUserService.single({ email: username })
          )
        );
      }

      const cacheKey = this.authCacheKey(username);

      const value = await this._cacheService.getCachedValue<AuthUser>(cacheKey);
      if (value) {
        return value;
      }

      const authUser = await this.withTwoFactorMethods(
        await withoutPolicies(() =>
          this._authUserService.single({ email: username })
        )
      );

      if (authUser) {
        await this._cacheService.addToCache(
          cacheKey,
          authUser,
          securityConfig.CACHE_TTL
        );
      }

      return authUser;
    } catch (e) {
      throw toDatabaseError(e);
    }
  }

  /**
   * Updates an authenticated user's information in the system.
   *
   * @param {ResourceId} id - The unique identifier of the authenticated user to be updated.
   * @param {Partial<AuthUser> & { password?: string }} data - The partial user data to update, optionally including a
   * password.
   * @return {Promise<AuthUser>} A promise that resolves to the updated authenticated user object.
   */
  public async updateAuthUser(
    id: ResourceId,
    data: Partial<AuthUser> & { password?: string }
  ): Promise<AuthUser> {
    let authUser: AuthUser;
    try {
      authUser = await withoutPolicies(() =>
        this._authUserService.update(id, data)
      );
    } catch (e) {
      throw toDatabaseError(e);
    }

    // Awaited unlike the update event eviction, so the next request, e.g. with
    // a token revoked by a logout, cannot read the previous state
    await this.evictCachedUsers(authUser);

    return authUser;
  }

  /**
   * Registers a new authenticated user based on the provided authentication source, email, and optional password and
   * additional data.
   *
   * @param {AuthSource} source - The authentication source to register the user, e.g., password, google, custom.
   * @param {string} email - The email address of the user to be registered.
   * @param {string} [password] - The optional password for the user, used when the authentication type requires it.
   * @param {Partial<UserAdditionalData>} [data] - Optional additional data related to the user to be stored during
   * registration.
   * @return {Promise<AuthUser>} A promise resolving to the registered authentication user object.
   * @throws {DatabaseError} If the registration fails, i.e. `DATABASE_UNIQUE_VIOLATION` for a taken username.
   */
  public async registerAuthUser(
    source: AuthSource,
    email: string,
    password?: string,
    data?: Partial<UserAdditionalData>
  ): Promise<AuthUser> {
    let authUser: AuthUser;

    try {
      const serviceConfig: { registrationData: RegistrationDataFn } =
        this._authUserService[CONFIG];

      const registrationData = await serviceConfig.registrationData(
        source,
        email,
        password,
        data
      );

      authUser = await withoutPolicies(() =>
        this._authUserService.create({
          ...registrationData,
          verifiedEmail: source !== AuthSource.Password
        })
      );
    } catch (e) {
      throw toDatabaseError(e);
    }

    await this.saveRegistrationFiles(authUser, source, data);

    return authUser;
  }

  /**
   * Changes the password for the authenticated user.
   *
   * @param {AuthUser} authUser - The authenticated user object containing user details.
   * @param {string} currentPassword - The current password of the authenticated user.
   * @param {string} newPassword - The new password to be set for the authenticated user.
   * @return {Promise<AuthTokens>} A promise that resolves to the new authentication tokens after the password is
   * successfully changed, of the `auth` scope and the source of the current session, since the user passed 2FA to
   * call it.
   * @throws {AuthError} `AUTH_PASSWORD_INVALID` if the current password does not match the stored password hash.
   */
  public async changePassword(
    authUser: AuthUser,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthTokens> {
    if (!passwordConfig.ENABLED) {
      throw new AuthError(
        ErrorCode.AuthPasswordDisabled,
        'Password update is not supported'
      );
    }

    if (
      !authUser.passwordHash ||
      !(await checkPassword(currentPassword, authUser.passwordHash))
    ) {
      throw new AuthError(
        ErrorCode.AuthPasswordInvalid,
        'Auth user current password invalid'
      );
    }

    const result = validatePasswordComplexity(newPassword);
    if (!result.valid) {
      throw new AuthError(ErrorCode.AuthPasswordWeak, result.message, {
        reason: result.message
      });
    }

    await this.updateAuthUser(authUser.id, {
      logoutAt: new Date(),
      passwordHash: await hashPassword(newPassword)
    });

    logger.debug({ id: authUser.id }, 'Password changed successfully');

    return this.generateAuthTokens(
      authUser,
      AuthScope.Auth,
      currentAuthSource() ?? AuthSource.Password
    );
  }

  /**
   * Authenticates a user by verifying their username and password.
   *
   * @param {string} username - The username of the user attempting to authenticate.
   * @param {string} password - The password of the user attempting to authenticate.
   * @return {Promise<AuthUser>} A promise that resolves to an authenticated user object if the credentials are valid.
   * @throws {AuthError} `AUTH_INVALID_CREDENTIALS` if the user does not exist, is disabled, or if the provided credentials are invalid. All three
   * cases throw the same error, so the response does not reveal which users exist.
   */
  public async authenticate(
    username: string,
    password: string
  ): Promise<AuthUser> {
    const authUser = await this.findByUsername(username);

    const passwordValid = await checkPassword(
      password,
      authUser?.passwordHash ??
        (await (timingGuardHash ??= hashPassword(
          randomBytes(32).toString('hex')
        )))
    );

    if (
      !authUser ||
      !authUser.enabled ||
      !authUser.passwordHash ||
      !passwordValid
    ) {
      logger.debug(
        { id: authUser?.id, reason: rejectionReason(authUser, passwordValid) },
        'User authentication rejected'
      );
      throw new AuthError(
        ErrorCode.AuthInvalidCredentials,
        'Invalid user credentials: wrong username or password, or the user is disabled'
      );
    }

    if (needsRehash(authUser.passwordHash)) {
      await this.rehashPassword(authUser, password);
    }

    logger.debug({ id: authUser.id }, 'User authenticated');

    return authUser;
  }

  /**
   * Authorizes a user based on provided authentication details, route configuration, and JWT payload
   * (if JWT auth type is used).
   *
   * @param {AuthUser | null} authUser - The authenticated user object. Can be null if no user is authenticated.
   * @param {string} url - The URL of the resource being accessed.
   * @param {RouteConfig} [routeConfig={}] - The route configuration object specifying required roles and permissions.
   * @param {JwtPayload} [jwtPayload] - The JWT payload containing additional authentication information.
   * @throws {AuthError} `AUTH_UNAUTHORIZED`, `AUTH_SCOPE_FORBIDDEN` or `AUTH_FORBIDDEN` if the user is not authorized to access url based on route config and JWT payload.
   */
  public authorize(
    authUser: AuthUser | null,
    url: string,
    routeConfig: RouteConfig = {},
    jwtPayload?: JwtPayload
  ): void {
    if (
      !authUser ||
      !authUser.enabled ||
      // `iat` has a whole second precision, so a token issued within the same
      // second as the logout is still accepted
      (authUser.logoutAt &&
        jwtPayload &&
        Math.floor(new Date(authUser.logoutAt).getTime() / 1000) >
          jwtPayload.iat)
    ) {
      throw new AuthError(ErrorCode.AuthUnauthorized, 'Unauthorized access');
    }

    if (jwtPayload && !checkScopeAccess(url, jwtPayload.scope)) {
      throw new AuthError(
        ErrorCode.AuthScopeForbidden,
        'JWT token is not authorized to access requested URL'
      );
    }

    const { roles, permissions } = routeConfig;
    if (!hasRoles(authUser, roles) || !hasPermissions(authUser, permissions)) {
      throw new AuthError(ErrorCode.AuthForbidden, 'Forbidden access');
    }
  }

  /**
   * Authenticates a user based on the provided username and password and generate access tokens.
   * If 2FA is forced at configuration level or auth user has enabled a 2FA method, then generate JWT with 2FA scope,
   * listing the methods of the user, otherwise return regular JWT with authentication scope.
   *
   * @param {string} username - The username of the user attempting to log in.
   * @param {string} password - The password of the user attempting to log in.
   * @return {Promise<AuthTokens>} A promise that resolves to an object containing authentication tokens if login is
   * successful.
   * @throws {AuthError} If the user does not exist, is disabled, or provides invalid credentials.
   */
  public async login(username: string, password: string): Promise<AuthTokens> {
    const authUser = await this.authenticate(username, password);

    if (isTwoFactorRequired(authUser)) {
      return this.generateAuthTokens(authUser, AuthScope.TwoFA);
    }

    return this.generateAuthTokens(authUser);
  }

  /**
   * Exchanges an existing token for new authentication tokens. When the one-time token was issued for an OAuth2
   * sign-in that needs confirming, the account password must be supplied alongside it. The tokens of a user who has
   * to pass 2FA have the `2fa` scope, unless the one-time token was issued by a passed 2FA challenge.
   *
   * @param {string} token - The token to be exchanged for new authentication tokens.
   * @param {string} [password] - The account password, required when the token was flagged for confirmation.
   * @return {Promise<AuthTokens>} A promise that resolves to a set of new authentication tokens.
   * @throws {AuthError} If the token is invalid, expired, associated with a non-existent or disabled user, or the
   * required password confirmation is missing or wrong.
   */
  public async exchangeToken(
    token: string,
    password?: string
  ): Promise<AuthTokens> {
    const {
      authUserId,
      authSource,
      providerAccountId,
      scope,
      passwordRequired,
      twoFactorVerified
    } = await this._securityStore.useOneTimeToken<AuthOTTData>(
      token,
      AuthOTTPurpose.Authentication
    );

    const authUser = await this.findById(authUserId);
    if (!authUser || !authUser.enabled) {
      throw new AuthError(
        ErrorCode.AuthUserNotFound,
        'Auth user does not exist or is disabled'
      );
    }

    if (passwordRequired) {
      await this.confirmPassword(authUser, password);
    }

    if (providerAccountId) {
      await this._oauth2Service?.linkConnectedAccount(
        authUser,
        authSource,
        providerAccountId,
        scope
      );

      // The provider confirmed the address, and ownership of the local account was proven by the password whenever it
      // had one, so an address that was never verified locally is settled by this sign-in
      if (!authUser.verifiedEmail) {
        await this.updateAuthUser(authUser.id, { verifiedEmail: true });
      }
    }

    logger.debug({ id: authUser.id }, 'User token exchanged');

    if (!twoFactorVerified && isTwoFactorRequired(authUser)) {
      return this.generateAuthTokens(authUser, AuthScope.TwoFA, authSource);
    }

    return this.generateAuthTokens(authUser, AuthScope.Auth, authSource);
  }

  /**
   * Generates authentication tokens (access and refresh tokens) for a given authenticated user.
   *
   * @param {AuthUser} authUser - The authenticated user for whom the tokens are to be generated.
   *                              Contains user identification and authentication details.
   * @param {AuthScope} [scope=AuthScope.Auth] - The scope for which the tokens are generated.
   * @param {AuthSource} [source=AuthSource.Password] - The authentication source used to generate access tokens.
   * @return {Promise<AuthTokens>} A promise that resolves to an object containing the generated authentication tokens:
   *                                - `accessToken` (string): The access token for API access.
   *                                - `refreshToken` (string): The refresh token for acquiring new access tokens.
   *                                - `expiresIn` (number): The expiration time (in seconds) of the access token.
   *                                - `refreshExpiresIn` (number): The expiration time (in seconds) of the refresh token.
   *                                - `twoFactorMethods` (string[]): The 2FA methods of the user, for the `2fa` scope.
   * @throws {ContextError} `CONTEXT_SERVER_UNAVAILABLE` if the server instance is not initialized.
   */
  public async generateAuthTokens(
    authUser: AuthUser,
    scope: AuthScope = AuthScope.Auth,
    source: AuthSource = AuthSource.Password
  ): Promise<AuthTokens> {
    const server = injectCreated<HttpServer>('HttpServer')?.instance;
    if (!server) {
      throw new ContextError(
        ErrorCode.ContextServerUnavailable,
        'Server instance not initialized'
      );
    }

    const jwtPayload: Omit<JwtPayload, 'iat'> = {
      scope,
      source,
      username: authUser.email,
      sub: authUser.id
    };

    // A token of the 2fa scope is never refreshed into the auth scope, so its refresh token keeps the 2fa scope and
    // the expiration of the access token
    const twoFactor = scope === AuthScope.TwoFA;
    const expiresIn = jwtConfig.EXPIRES_IN;
    const refreshExpiresIn = twoFactor
      ? expiresIn
      : jwtConfig.REFRESH_EXPIRES_IN;

    // The signer sets the `iat` claim, in seconds like the expiration
    const accessToken = server.jwt.sign(jwtPayload, { expiresIn });
    const refreshToken = server.jwt.sign(
      { ...jwtPayload, scope: twoFactor ? AuthScope.TwoFA : AuthScope.Refresh },
      { expiresIn: refreshExpiresIn }
    );

    logger.debug({ id: authUser.id }, 'Access tokens generated');

    const tokens = { accessToken, refreshToken, expiresIn, refreshExpiresIn };

    return twoFactor
      ? { ...tokens, twoFactorMethods: effectiveTwoFactorMethods(authUser) }
      : tokens;
  }

  /**
   * Logs out a user by updating their authentication information with a logout timestamp.
   *
   * @param {ResourceId} id - The unique identifier of the user to be logged out.
   * @return {Promise<boolean>} A promise that resolves to a boolean indicating whether the logout operation was
   * successful.
   */
  public async logout(id: ResourceId): Promise<boolean> {
    logger.debug({ id }, 'User logout');

    return !!(await this.updateAuthUser(id, { logoutAt: new Date() }));
  }

  /**
   * Removes the cached state of users, so the next lookup reads them again, i.e. after their 2FA methods changed.
   *
   * @param {...(AuthUser | undefined)} authUsers - The users to evict, by their id and their email.
   * @return {Promise<void>} A promise that resolves once the users are evicted.
   */
  public async evictCachedUsers(
    ...authUsers: (AuthUser | undefined)[]
  ): Promise<void> {
    const keys = new Set<string>();
    for (const authUser of authUsers) {
      if (authUser) {
        keys.add(this.authCacheKey(authUser.id));
        keys.add(this.authCacheKey(authUser.email));
      }
    }

    for (const key of keys) {
      await this._cacheService.removeCachedValue(key);
    }
  }

  /**
   * Saves the files the `registrationFiles` service configuration selects for a newly registered user, each one to the
   * file field of the auth model it is keyed by. The files are stored only after the user exists, since a file record
   * is linked to the resource that owns it. Storing a file is best-effort, so a rejected file, such as an avatar the
   * provider served in an unsupported format, is logged and never fails the registration.
   *
   * @internal
   */
  private async saveRegistrationFiles(
    authUser: AuthUser,
    source: AuthSource,
    data?: Partial<UserAdditionalData>
  ): Promise<void> {
    const serviceConfig: { registrationFiles?: RegistrationFilesFn } =
      this._authUserService[CONFIG];

    if (!serviceConfig.registrationFiles) {
      return;
    }

    let files: RegistrationFiles;
    try {
      files = (await serviceConfig.registrationFiles(source, data)) ?? {};
    } catch (e) {
      logger.error(
        { id: authUser.id, err: e },
        'Registration files selection error'
      );
      return;
    }

    const fileService = inject(FileService);

    for (const [field, file] of Object.entries(files)) {
      if (!file) {
        continue;
      }

      try {
        await withoutPolicies(() =>
          fileService.saveBuffer(
            field,
            file,
            authUser,
            this._authUserService.client
          )
        );
      } catch (e) {
        logger.error(
          { id: authUser.id, field, err: e },
          'Registration file save error'
        );
      }
    }
  }

  /**
   * Verifies the account password supplied to confirm linking an OAuth2 provider.
   *
   * @internal
   */
  private async confirmPassword(
    authUser: AuthUser,
    password?: string
  ): Promise<void> {
    if (!password) {
      throw new AuthError(
        ErrorCode.AuthPasswordRequired,
        'Password confirmation is required to link this provider account'
      );
    }

    if (
      !authUser.passwordHash ||
      !(await checkPassword(password, authUser.passwordHash))
    ) {
      logger.debug(
        { id: authUser.id },
        'OAuth2 password confirmation rejected'
      );
      throw new AuthError(
        ErrorCode.AuthInvalidCredentials,
        'Invalid user credentials'
      );
    }
  }

  /**
   * Replaces a password hash made with outdated parameters. A failure only logs a warning, so it never fails the login.
   *
   * @internal
   */
  private async rehashPassword(
    authUser: AuthUser,
    password: string
  ): Promise<void> {
    try {
      await this.updateAuthUser(authUser.id, {
        passwordHash: await hashPassword(password)
      });
      logger.debug({ id: authUser.id }, 'Password rehashed');
    } catch (e) {
      logger.warn({ id: authUser.id, err: e }, 'Password rehash failed');
    }
  }

  /**
   * Adds the confirmed 2FA methods of a user, by their priority, as the `twoFactorMethods` of the auth user.
   *
   * @internal
   */
  private async withTwoFactorMethods(
    authUser: AuthUser | null
  ): Promise<AuthUser | null> {
    const service = this._twoFactorMethodService;
    if (!authUser || !service) {
      return authUser;
    }

    const authRelation = uncapitalize(this._authUserService.modelName);
    const { items } = await withoutPolicies(() =>
      service.query({
        filter: { [authRelation]: authUser.id } as any,
        size: 100,
        totalCount: false
      })
    );

    const twoFactorMethods = (items as TwoFactorMethod[])
      .filter((method) => method.confirmedAt)
      .sort((a, b) => a.priority - b.priority)
      .map((method) => method.type);

    return { ...authUser, twoFactorMethods };
  }

  /** @internal */
  private authCacheKey(idOrUsername: ResourceId): string {
    return this._cacheService.buildCacheKey({
      baseKey: `${AUTH_KEY}:${idOrUsername}`,
      modelName: this._authUserService.modelName
    });
  }
}

/** Why a user failed to authenticate, logged but never told to the client. */
function rejectionReason(
  authUser: AuthUser | null | undefined,
  passwordValid: boolean
): string {
  if (!authUser) {
    return 'unknown user';
  }
  if (!authUser.enabled) {
    return 'disabled';
  }
  return authUser.passwordHash && !passwordValid
    ? 'wrong password'
    : 'no password';
}
