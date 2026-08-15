import {
  AuthSource,
  AuthUser,
  IResourceService,
  uncapitalize
} from '@appweaver/common';
import { injectService } from '../context';
import { HttpError } from '../errors';
import { ConnectedAccount } from '../types';
import { resourceAuthModel } from './helper';

/**
 * The link carries a relation to whichever model the application marked as its auth model, so the generated types
 * cannot name that field. It is addressed by its runtime name instead.
 */
type ConnectedAccountRecord = ConnectedAccount & Record<string, any>;

type ConnectedAccountResourceService = IResourceService<
  ConnectedAccountRecord,
  ConnectedAccountRecord,
  Partial<ConnectedAccountRecord>,
  Partial<ConnectedAccountRecord>
>;

/**
 * Tracks which OAuth2 provider accounts are linked to which local users. The link is what tells an already trusted
 * sign-in apart from a first-time one, so it decides whether the password has to be confirmed.
 */
export class ConnectedAccountService {
  /**
   * The underlying resource service, or `undefined` when every OAuth2 provider is disabled and the table is not kept.
   * Resolved on each access because resources are loaded after the security services are constructed.
   *
   * @internal
   */
  private get _service(): ConnectedAccountResourceService | undefined {
    return injectService<ConnectedAccountResourceService, false>(
      'ConnectedAccount',
      false
    );
  }

  /**
   * Whether connected accounts are being tracked at all.
   *
   * @return {boolean} True when the `ConnectedAccount` resource is available.
   */
  public get enabled(): boolean {
    return !!this._service;
  }

  /**
   * Finds the local link for a provider account.
   *
   * @param {AuthSource} provider - The OAuth2 auth source.
   * @param {string} providerAccountId - The user identifier reported by the provider.
   * @return {Promise<ConnectedAccount | null>} A promise resolving to the link, or null when the account is unknown.
   */
  public async find(
    provider: AuthSource,
    providerAccountId: string
  ): Promise<ConnectedAccountRecord | null> {
    const service = this._service;
    if (!service) {
      return null;
    }

    try {
      const result = await service.query({ provider, providerAccountId });
      return result.items[0] ?? null;
    } catch (e) {
      throw new HttpError('Connected account find error', 500, e);
    }
  }

  /**
   * Checks whether a provider account is already linked to a specific user.
   *
   * @param {AuthUser} authUser - The local user.
   * @param {AuthSource} provider - The OAuth2 auth source.
   * @param {string} providerAccountId - The user identifier reported by the provider.
   * @return {Promise<boolean>} A promise resolving to true when the link exists and belongs to that user.
   */
  public async isLinked(
    authUser: AuthUser,
    provider: AuthSource,
    providerAccountId: string
  ): Promise<boolean> {
    const account = await this.find(provider, providerAccountId);

    return !!account && this.ownerId(account) === authUser.id;
  }

  /**
   * Records a successful OAuth2 sign-in, creating the link on the first one and refreshing it afterwards.
   *
   * @param {AuthUser} authUser - The local user the provider account belongs to.
   * @param {AuthSource} provider - The OAuth2 auth source.
   * @param {string} providerAccountId - The user identifier reported by the provider.
   * @param {string} [scope] - The scopes granted by the provider.
   * @return {Promise<void>} A promise that resolves once the link is stored.
   * @throws {HttpError} If the provider account is already linked to a different user.
   */
  public async link(
    authUser: AuthUser,
    provider: AuthSource,
    providerAccountId: string,
    scope?: string
  ): Promise<void> {
    const service = this._service;
    if (!service) {
      return;
    }

    const account = await this.find(provider, providerAccountId);

    if (account && this.ownerId(account) !== authUser.id) {
      throw new HttpError(
        'This provider account is already linked to another user',
        403
      );
    }

    try {
      if (account) {
        await service.update(account.id, { scope, lastLoginAt: new Date() });
        return;
      }

      await service.create({
        provider,
        providerAccountId,
        scope,
        lastLoginAt: new Date(),
        [uncapitalize(resourceAuthModel()!.name)]: { id: authUser.id }
      });
    } catch (e) {
      throw new HttpError('Connected account link error', 500, e);
    }
  }

  /**
   * Reads the owning user id off a link, which the generated model exposes as a `<authModel>Id` foreign key.
   *
   * @internal
   */
  private ownerId(account: ConnectedAccountRecord): number | undefined {
    return account[`${uncapitalize(resourceAuthModel()!.name)}Id`];
  }
}
