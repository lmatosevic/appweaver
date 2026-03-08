import { config } from '@appweaver/common';
import { checkPassword, hashPassword, resourceAuthService } from './helper';
import { context, inject } from '../context';
import { CacheService } from '../cache';
import { HttpError } from '../errors';
import { AuthTokens, AuthUser, IResourceService, JwtPayload } from '../types';

export class AuthService {
  /** @internal */
  private readonly _cacheService = inject(CacheService);
  /** @internal */
  private readonly _authUserService: IResourceService<AuthUser, AuthUser>;

  constructor() {
    this._authUserService = resourceAuthService()!;
  }

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

  public async findByUsername(username: string): Promise<AuthUser | null> {
    try {
      const result = await this._authUserService.query({ email: username });
      return result.items[0];
    } catch (e) {
      throw new HttpError('Auth user find error', 500, e);
    }
  }

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

    return this.login(authUser.email, newPassword);
  }

  public async login(username: string, password: string): Promise<AuthTokens> {
    const authUser = await this.findByUsername(username);
    if (!authUser || !authUser.enabled || !authUser.passwordHash) {
      throw new HttpError('Auth user does not exist or is disabled', 400);
    }

    if (!(await checkPassword(password, authUser.passwordHash))) {
      throw new HttpError('Invalid login credentials', 401);
    }

    return this.generateAuthTokens(authUser);
  }

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

    return { accessToken, refreshToken, expiresIn, refreshExpiresIn };
  }

  public async logout(id: number): Promise<boolean> {
    return !!(await this.updateAuthUser(id, { logoutAt: new Date() }));
  }
}
