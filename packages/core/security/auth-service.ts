import {
  AuthOTTPurpose,
  AuthScope,
  AuthSource,
  config,
  CONFIG,
  logger,
  RouteConfig,
  SecurityStore
} from '@appweaver/common';
import {
  checkPassword,
  checkScopeAccess,
  hashPassword,
  hasPermissions,
  hasRoles,
  resourceAuthService,
  validatePasswordComplexity
} from './helper';
import { context, inject } from '../context';
import { CacheService } from '../cache';
import { HttpError } from '../errors';
import {
  AuthOTTData,
  AuthTokens,
  AuthUser,
  JwtPayload,
  RegistrationDataFn,
  UserAdditionalData
} from '../types';

const AUTH_KEY = 'auth';

export class AuthService {
  /** @internal */
  private readonly _securityStore = inject(SecurityStore);
  /** @internal */
  private readonly _cacheService = inject(CacheService);
  /** @internal */
  private readonly _authUserService = resourceAuthService()!;

  /**
   * Finds an authenticated user by their unique identifier.
   *
   * @param {number} id - The unique identifier of the authenticated user to find.
   * @return {Promise<AuthUser | null>} A promise that resolves to the authenticated user object if found, otherwise
   * null.
   */
  public async findById(id: number): Promise<AuthUser | null> {
    try {
      if (!config.CACHE_ENABLED || config.SECURITY_CACHE_TTL < 0) {
        return this._authUserService.find(id);
      }

      const cacheKey = this._cacheService.buildCacheKey({
        baseKey: `${AUTH_KEY}:${id}`,
        modelName: this._authUserService.modelName
      });

      const value = await this._cacheService.getCachedValue<AuthUser>(cacheKey);
      if (value) {
        return value;
      }

      const authUser = await this._authUserService.find(id);

      await this._cacheService.addToCache(
        cacheKey,
        authUser,
        config.SECURITY_CACHE_TTL
      );

      return authUser;
    } catch (e) {
      throw new HttpError('Auth user find error', 500, e);
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
      if (!config.CACHE_ENABLED || config.SECURITY_CACHE_TTL < 0) {
        const result = await this._authUserService.query({ email: username });
        return result.items[0] ?? null;
      }

      const cacheKey = this._cacheService.buildCacheKey({
        baseKey: `${AUTH_KEY}:${username}`,
        modelName: this._authUserService.modelName
      });

      const value = await this._cacheService.getCachedValue<AuthUser>(cacheKey);
      if (value) {
        return value;
      }

      const result = await this._authUserService.query({ email: username });
      const authUser = result.items[0] ?? null;

      if (authUser) {
        await this._cacheService.addToCache(
          cacheKey,
          authUser,
          config.SECURITY_CACHE_TTL
        );
      }

      return authUser;
    } catch (e) {
      throw new HttpError('Auth user find error', 500, e);
    }
  }

  /**
   * Updates an authenticated user's information in the system.
   *
   * @param {number} id - The unique identifier of the authenticated user to be updated.
   * @param {Partial<AuthUser> & { password?: string }} data - The partial user data to update, optionally including a
   * password.
   * @return {Promise<AuthUser>} A promise that resolves to the updated authenticated user object.
   */
  public async updateAuthUser(
    id: number,
    data: Partial<AuthUser> & { password?: string }
  ): Promise<AuthUser> {
    try {
      return await this._authUserService.update(id, data);
    } catch (e) {
      throw new HttpError('Auth user update error', 500, e);
    }
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
   * @throws {HttpError} Throws an error if the registration process fails.
   */
  public async registerAuthUser(
    source: AuthSource,
    email: string,
    password?: string,
    data?: Partial<UserAdditionalData>
  ): Promise<AuthUser> {
    try {
      const serviceConfig: { registrationData: RegistrationDataFn } =
        this._authUserService[CONFIG];

      const registrationData = serviceConfig.registrationData(
        source,
        email,
        password,
        data
      );

      return this._authUserService.create({
        ...registrationData,
        verifiedEmail: source !== AuthSource.Password
      });
    } catch (e) {
      throw new HttpError('Auth user registration error', 500, e);
    }
  }

  /**
   * Changes the password for the authenticated user.
   *
   * @param {AuthUser} authUser - The authenticated user object containing user details.
   * @param {string} currentPassword - The current password of the authenticated user.
   * @param {string} newPassword - The new password to be set for the authenticated user.
   * @return {Promise<AuthTokens>} A promise that resolves to the new authentication tokens after the password is
   * successfully changed.
   * @throws {HttpError} If the current password does not match the stored password hash.
   */
  public async changePassword(
    authUser: AuthUser,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthTokens> {
    if (!config.SECURITY_PASSWORD_ENABLED) {
      throw new HttpError('Password update is not supported', 403);
    }

    if (
      !authUser.passwordHash ||
      !(await checkPassword(currentPassword, authUser.passwordHash))
    ) {
      throw new HttpError('Auth user current password invalid', 403);
    }

    const result = validatePasswordComplexity(newPassword);
    if (!result.valid) {
      throw new HttpError(result.message, 400);
    }

    await this.updateAuthUser(authUser.id, {
      logoutAt: new Date(),
      passwordHash: await hashPassword(newPassword)
    });

    logger.debug({ id: authUser.id }, 'Password changed successfully');

    return this.login(authUser.email, newPassword);
  }

  /**
   * Authenticates a user by verifying their username and password.
   *
   * @param {string} username - The username of the user attempting to authenticate.
   * @param {string} password - The password of the user attempting to authenticate.
   * @return {Promise<AuthUser>} A promise that resolves to an authenticated user object if the credentials are valid.
   * @throws {HttpError} If the user does not exist, is disabled, or if the provided credentials are invalid.
   */
  public async authenticate(
    username: string,
    password: string
  ): Promise<AuthUser> {
    const authUser = await this.findByUsername(username);
    if (!authUser || !authUser.enabled || !authUser.passwordHash) {
      throw new HttpError('Auth user does not exist or is disabled', 400);
    }

    if (!(await checkPassword(password, authUser.passwordHash))) {
      throw new HttpError('Invalid user credentials', 401);
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
   * @throws {HttpError} If the user is not authorized to access url based on route config and JWT payload.
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
      (authUser.logoutAt &&
        jwtPayload &&
        new Date(authUser.logoutAt).getTime() > jwtPayload?.iat)
    ) {
      throw new HttpError('Unauthorized access', 401);
    }

    if (jwtPayload && !checkScopeAccess(url, jwtPayload.scope)) {
      throw new HttpError(
        `JWT token is not authorized to access requested URL`,
        403
      );
    }

    const { roles, permissions } = routeConfig;
    if (!hasRoles(authUser, roles) || !hasPermissions(authUser, permissions)) {
      throw new HttpError('Forbidden access', 403);
    }
  }

  /**
   * Authenticates a user based on the provided username and password and generate access tokens.
   * If 2FA is forced at configuration level or auth user has enabled 2FA, then generate JWT with 2FA scope,
   * otherwise return regular JWT with authentication scope.
   *
   * @param {string} username - The username of the user attempting to log in.
   * @param {string} password - The password of the user attempting to log in.
   * @return {Promise<AuthTokens>} A promise that resolves to an object containing authentication tokens if login is
   * successful.
   * @throws {HttpError} If the user does not exist, is disabled, or provides invalid credentials.
   */
  public async login(username: string, password: string): Promise<AuthTokens> {
    const authUser = await this.authenticate(username, password);

    if (
      config.SECURITY_ACCOUNT_2FA_ENABLED &&
      (config.SECURITY_ACCOUNT_2FA_FORCED || authUser.twoFactorAuth !== 'None')
    ) {
      return this.generateAuthTokens(authUser, AuthScope.TwoFA);
    }

    return this.generateAuthTokens(authUser);
  }

  /**
   * Exchanges an existing token for new authentication tokens.
   *
   * @param {string} token - The token to be exchanged for new authentication tokens.
   * @return {Promise<AuthTokens>} A promise that resolves to a set of new authentication tokens.
   * @throws {HttpError} If the token is invalid, expired, or associated with a non-existent or disabled user.
   */
  public async exchangeToken(token: string): Promise<AuthTokens> {
    const { authUserId, authSource } =
      await this._securityStore.useOneTimeToken<AuthOTTData>(
        token,
        AuthOTTPurpose.Authentication
      );

    const authUser = await this.findById(authUserId);
    if (!authUser || !authUser.enabled) {
      throw new HttpError('Auth user does not exist or is disabled', 400);
    }

    logger.debug({ id: authUser.id, token }, 'User token exchanged');

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
   * @throws {HttpError} If the server instance is not initialized.
   */
  public async generateAuthTokens(
    authUser: AuthUser,
    scope: AuthScope = AuthScope.Auth,
    source: AuthSource = AuthSource.Password
  ): Promise<AuthTokens> {
    const server = context.server;
    if (!server) {
      throw new HttpError('Server instance not initialized');
    }

    const jwtPayload: JwtPayload = {
      scope,
      source,
      username: authUser.email,
      sub: authUser.id,
      iat: new Date().getTime()
    };

    const expiresIn = config.SECURITY_JWT_EXPIRES_IN;
    const refreshExpiresIn = config.SECURITY_JWT_REFRESH_EXPIRES_IN;

    const accessToken = server.jwt.sign(jwtPayload, { expiresIn });
    const refreshToken = server.jwt.sign(
      { ...jwtPayload, scope: AuthScope.Refresh },
      { expiresIn: refreshExpiresIn }
    );

    logger.debug({ id: authUser.id }, 'Access tokens generated');

    return { accessToken, refreshToken, expiresIn, refreshExpiresIn };
  }

  /**
   * Logs out a user by updating their authentication information with a logout timestamp.
   *
   * @param {number} id - The unique identifier of the user to be logged out.
   * @return {Promise<boolean>} A promise that resolves to a boolean indicating whether the logout operation was
   * successful.
   */
  public async logout(id: number): Promise<boolean> {
    await this._cacheService.removeCachedValue(`${AUTH_KEY}:${id}`);

    logger.debug({ id }, 'User logout');

    return !!(await this.updateAuthUser(id, { logoutAt: new Date() }));
  }
}
