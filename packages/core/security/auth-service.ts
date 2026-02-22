import { config } from '@appweaver/common';
import { checkPassword, hashPassword, resourceAuthService } from './helper';
import { context } from '../context';
import { HttpError } from '../errors';
import { AuthTokens, AuthUser, JwtPayload } from '../types';
import { ResourceService } from '../resource';

export class AuthService {
  public async findById(id: number): Promise<AuthUser | null> {
    try {
      return this.authUserService().find(id);
    } catch (e) {
      throw new HttpError('Auth user find error', 500, e);
    }
  }

  public async findByUsername(username: string): Promise<AuthUser | null> {
    try {
      const result = await this.authUserService().query({ email: username });
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
      return await this.authUserService().update(id, data);
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

  private authUserService(): ResourceService<AuthUser, AuthUser> {
    return resourceAuthService()!;
  }
}

const authService = new AuthService();

export { authService };
