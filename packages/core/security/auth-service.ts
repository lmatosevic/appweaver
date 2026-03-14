import {
  AuthType,
  CONFIG,
  config,
  generateToken,
  logger,
  Redis,
  uuid
} from '@appweaver/common';
import { checkPassword, hashPassword, resourceAuthService } from './helper';
import { context, inject } from '../context';
import { CacheService } from '../cache';
import { HttpError } from '../errors';
import {
  AuthTokens,
  AuthUser,
  IResourceService,
  JwtPayload,
  RegistrationDataFn,
  UserAdditionalData
} from '../types';

type StateData = {
  returnToUrl: string;
};

const OAUTH2_STATE_KEY = 'oauth2:state';
const OAUTH2_OTT_KEY = 'oauth2:ott';

export class AuthService {
  /** @internal */
  private readonly _cacheService = inject(CacheService);
  /** @internal */
  private readonly _redis = inject(Redis);
  /** @internal */
  private readonly _authUserService: IResourceService<AuthUser, AuthUser>;

  constructor() {
    this._authUserService = resourceAuthService()!;
  }

  /**
   * Finds an authenticated user by their unique identifier.
   *
   * @param {number} id - The unique identifier of the authenticated user to find.
   * @return {Promise<AuthUser | null>} A promise that resolves to the authenticated user object if found, otherwise
   * null.
   */
  public async findById(id: number): Promise<AuthUser | null> {
    try {
      const findAuthAction = this._authUserService.find(id);

      if (!config.CACHE_ENABLED || config.SECURITY_CACHE_TTL < 0) {
        return findAuthAction;
      }

      const cacheKey = this._cacheService.buildCacheKey({
        baseKey: `auth:${id}`,
        modelName: this._authUserService.modelName
      });

      const value = await this._cacheService.getCachedValue<AuthUser>(cacheKey);
      if (value) {
        return value;
      }

      const authUser = await findAuthAction;

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
      const result = await this._authUserService.query({ email: username });
      return result.items[0];
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
   * Registers a new authenticated user based on the provided authentication type, email, and optional password and
   * additional data.
   *
   * @param {AuthType} authType - The authentication type to register the user, e.g., email, social login, etc.
   * @param {string} email - The email address of the user to be registered.
   * @param {string} [password] - The optional password for the user, used when the authentication type requires it.
   * @param {Partial<UserAdditionalData>} [data] - Optional additional data related to the user to be stored during
   * registration.
   * @return {Promise<AuthUser>} A promise resolving to the registered authentication user object.
   * @throws {HttpError} Throws an error if the registration process fails.
   */
  public async registerAuthUser(
    authType: AuthType,
    email: string,
    password?: string,
    data?: Partial<UserAdditionalData>
  ): Promise<AuthUser> {
    try {
      const serviceConfig: { registrationData: RegistrationDataFn } =
        this._authUserService[CONFIG];
      const registrationData = serviceConfig.registrationData(
        authType,
        email,
        password,
        data
      );
      return await this._authUserService.create({
        ...registrationData,
        verifiedEmail: authType !== AuthType.Password
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
    if (
      !authUser.passwordHash ||
      !(await checkPassword(currentPassword, authUser.passwordHash))
    ) {
      throw new HttpError('Auth user current password', 403);
    }

    await this.updateAuthUser(authUser.id, {
      logoutAt: new Date(),
      passwordHash: await hashPassword(newPassword)
    });

    logger.debug({ id: authUser.id }, 'Password changed successfully');

    return this.login(authUser.email, newPassword);
  }

  /**
   * Authenticates a user based on the provided username and password.
   *
   * @param {string} username - The username of the user attempting to log in.
   * @param {string} password - The password of the user attempting to log in.
   * @return {Promise<AuthTokens>} A promise that resolves to an object containing authentication tokens if login is
   * successful.
   * @throws {HttpError} If the user does not exist, is disabled, or provides invalid credentials.
   */
  public async login(username: string, password: string): Promise<AuthTokens> {
    const authUser = await this.findByUsername(username);
    if (!authUser || !authUser.enabled || !authUser.passwordHash) {
      throw new HttpError('Auth user does not exist or is disabled', 400);
    }

    if (!(await checkPassword(password, authUser.passwordHash))) {
      throw new HttpError('Invalid login credentials', 401);
    }

    logger.debug({ id: authUser.id }, 'User login');

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
    const authUserId = await this._redis.getValue<number>(
      `${OAUTH2_OTT_KEY}:${token}`
    );
    if (!authUserId) {
      throw new HttpError('Invalid or expired token provided', 401);
    }

    const authUser = await this.findById(authUserId);
    if (!authUser || !authUser.enabled) {
      throw new HttpError('Auth user does not exist or is disabled', 400);
    }

    await this._redis.removeValue(`${OAUTH2_OTT_KEY}:${token}`);

    logger.debug({ id: authUser.id, token }, 'User token exchanged');

    return this.generateAuthTokens(authUser);
  }

  /**
   * Validates the provided OAuth2 state, ensuring it has not expired or is invalid.
   * If the state is valid, it retrieves and removes it from the storage.
   *
   * @param {string} state The OAuth2 state value to be validated and checked.
   * @return A promise resolving to the retrieved state data.
   * @throws HttpError if the state is invalid or expired.
   */
  public async checkOAuth2State(state: string): Promise<StateData> {
    const data = await this._redis.getValue(`${OAUTH2_STATE_KEY}:${state}`);
    if (!data) {
      throw new HttpError('Invalid or expired state received', 401);
    }

    await this._redis.removeValue(`${OAUTH2_STATE_KEY}:${state}`);

    return data;
  }

  /**
   * Generates an OAuth2 state string to be used in the authorization process.
   * The state string is stored in Redis with an associated TTL (time-to-live).
   * Ensures that the `returnToUrl` provided in the `StateData` conforms to security policies.
   *
   * @param {StateData} data - Object containing the state data and the `returnToUrl`.
   * @return {Promise<string>} A promise that resolves to the generated OAuth2 state string.
   * @throws {HttpError} Throws an error if the `returnToUrl` is invalid or if the hostname is not allowed.
   */
  public async generateOAuth2State(data: StateData): Promise<string> {
    let url: URL;
    try {
      url = new URL(data.returnToUrl);
    } catch (e) {
      throw new HttpError(
        `Invalid format of returnToUrl: ${data.returnToUrl}`,
        400
      );
    }

    if (
      !config.SECURITY_OAUTH2_ALLOWED_HOSTS.includes('*') &&
      !config.SECURITY_OAUTH2_ALLOWED_HOSTS.includes(url.hostname)
    ) {
      throw new HttpError(
        `The ${url.hostname} host is not allowed as a return URL`,
        400
      );
    }

    const state = uuid();

    await this._redis.putValue(
      `${OAUTH2_STATE_KEY}:${state}`,
      data,
      config.SECURITY_OAUTH2_STATE_TTL
    );

    return state;
  }

  /**
   * Generates a one-time-use token for the provided authenticated user.
   *
   * @param {AuthUser} authUser - The authenticated user for whom the token is generated.
   * @return {Promise<string>} A promise that resolves to the generated one-time token.
   */
  public async generateOneTimeToken(authUser: AuthUser): Promise<string> {
    const token = generateToken('base62', 256);

    await this._redis.putValue(
      `${OAUTH2_OTT_KEY}:${token}`,
      authUser.id,
      config.SECURITY_OAUTH2_OTT_TTL
    );

    return token;
  }

  /**
   * Generates authentication tokens (access and refresh tokens) for a given authenticated user.
   *
   * @param {AuthUser} authUser - The authenticated user for whom the tokens are to be generated.
   *                              Contains user identification and authentication details.
   * @return {Promise<AuthTokens>} A promise that resolves to an object containing the generated authentication tokens:
   *                                - `accessToken` (string): The access token for API access.
   *                                - `refreshToken` (string): The refresh token for acquiring new access tokens.
   *                                - `expiresIn` (number): The expiration time (in seconds) of the access token.
   *                                - `refreshExpiresIn` (number): The expiration time (in seconds) of the refresh token.
   * @throws {HttpError} If the server instance is not initialized.
   */
  public async generateAuthTokens(authUser: AuthUser): Promise<AuthTokens> {
    const server = context.server;
    if (!server) {
      throw new HttpError('Server instance not initialized');
    }

    const jwtPayload: JwtPayload = {
      username: authUser.email,
      sub: authUser.id,
      iat: new Date().getTime()
    };

    const expiresIn = config.SECURITY_JWT_EXPIRES_IN;
    const refreshExpiresIn = config.SECURITY_JWT_REFRESH_EXPIRES_IN;

    const accessToken = server.jwt.sign(jwtPayload, { expiresIn });
    const refreshToken = server.jwt.sign(
      { ...jwtPayload, refresh: true },
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
    logger.debug({ id }, 'User logout');
    return !!(await this.updateAuthUser(id, { logoutAt: new Date() }));
  }
}
