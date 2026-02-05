import { HttpError, config } from '@appweaver/common';
import { checkPassword, hashPassword, updatePasswordHash } from './helper';
import { db } from '../database';
import { context } from '../context';
import { Identity, JwtPayload } from '../types';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
};

export class AuthService {
  private readonly include = { roles: { include: { permissions: true } } };

  public async findById(id: number): Promise<Identity | null> {
    try {
      return db.client.identity.findFirst({
        where: { id },
        include: this.include
      });
    } catch (e) {
      throw new HttpError('Identity find error', 500, e);
    }
  }

  public async findByUsername(username: string): Promise<Identity | null> {
    try {
      return db.client.identity.findFirst({
        where: { username },
        include: this.include
      });
    } catch (e) {
      throw new HttpError('Identity find error', 500, e);
    }
  }

  public async updateIdentity(
    id: number,
    data: Partial<Identity> & { password?: string }
  ): Promise<Identity> {
    try {
      await updatePasswordHash(data, data.password, true);
      return db.client.identity.update({
        where: { id },
        include: this.include,
        data: {
          ...data,
          roles: {
            connect: data.roles?.map((role) => ({ id: role.id }))
          }
        }
      });
    } catch (e) {
      throw new HttpError('Identity update error', 500, e);
    }
  }

  public async changePassword(
    Identity: Identity,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthTokens> {
    if (
      !Identity.passwordHash ||
      !(await checkPassword(currentPassword, Identity.passwordHash))
    ) {
      throw new HttpError('Invalid current password', 403);
    }

    await this.updateIdentity(Identity.id, {
      logoutAt: new Date(),
      passwordHash: await hashPassword(newPassword)
    });

    return this.login(Identity.username, newPassword);
  }

  public async login(username: string, password: string): Promise<AuthTokens> {
    const Identity = await this.findByUsername(username);
    if (!Identity || !Identity.enabled || !Identity.passwordHash) {
      throw new HttpError('Identity does not exist or is disabled', 400);
    }

    if (!(await checkPassword(password, Identity.passwordHash))) {
      throw new HttpError('Invalid login credentials', 401);
    }

    return this.generateAuthTokens(Identity);
  }

  public async generateAuthTokens(identity: Identity): Promise<AuthTokens> {
    const server = context.server;
    if (!server) {
      throw new HttpError('Server instance not initialized');
    }

    const jwtPayload: JwtPayload = {
      username: identity.username,
      sub: identity.id,
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
    return !!(await this.updateIdentity(id, { logoutAt: new Date() }));
  }
}

const authService = new AuthService();

export { authService };
