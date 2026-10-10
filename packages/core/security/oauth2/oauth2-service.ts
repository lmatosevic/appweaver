import {
  AuthSource,
  AuthUser,
  CONFIG,
  ErrorCode,
  isAppweaverError,
  logger,
  ResourceId,
  uncapitalize
} from '@appweaver/common';
import { injectService } from '../../context';
import { toDatabaseError } from '../../database';
import { OAuth2Error } from './oauth2-error';
import { resourceAuthService } from '../helper';
import { withoutPolicies } from '../../utils';
import {
  CheckOAuth2UserFn,
  ConnectedAccount,
  ConnectedAccountResourceService,
  UserInfo
} from '../../types';

/**
 * Handles the parts of authentication that only apply to OAuth2 sign-ins: the application's own admission check, the
 * links between provider accounts and local users, and the rule deciding when a sign-in has to be confirmed with the
 * account password.
 */
export class OAuth2Service {
  /** @internal */
  private readonly _authUserService = resourceAuthService()!;
  /** Optional, since an application with no OAuth2 provider never registers it.
   * @internal */
  private readonly _connectedAccountService = injectService(
    'ConnectedAccount',
    false
  ) as ConnectedAccountResourceService | undefined;

  /**
   * Checks whether a user is allowed to be registered and/or authenticated via OAuth2 by invoking the optional
   * `checkOAuth2User` callback configured on the auth service. When the callback returns nothing, the OAuth2 flow
   * proceeds normally (registration of a new user or login of an existing one). When it returns a string or an error,
   * the flow is aborted by throwing an {@link OAuth2Error}.
   *
   * @param {AuthSource} source - The OAuth2 authentication source, e.g., oauth2Google, oauth2Facebook, oauth2Custom.
   * @param {UserInfo} userInfo - The user info extracted from the OAuth2 provider.
   * @param {AuthUser | null} authUser - The existing authenticated user matched by email, or null when the user does
   * not exist yet (i.e., a new user would be registered).
   * @return {Promise<void>} A promise that resolves when the user is allowed to proceed.
   * @throws {OAuth2Error} `OAUTH2_USER_REJECTED` if the configured callback returns a string or an error, unless it
   * returns an `AppweaverError`, i.e. an `ApplicationError`, which is thrown as-is.
   */
  public async checkUser(
    source: AuthSource,
    userInfo: UserInfo,
    authUser: AuthUser | null
  ): Promise<void> {
    const serviceConfig: { checkOAuth2User?: CheckOAuth2UserFn } =
      this._authUserService[CONFIG];

    if (!serviceConfig.checkOAuth2User) {
      return;
    }

    const result = await serviceConfig.checkOAuth2User(
      source,
      userInfo,
      authUser
    );
    if (!result) {
      return;
    }

    if (isAppweaverError(result)) {
      throw result;
    }

    throw new OAuth2Error(
      ErrorCode.OAuth2UserRejected,
      result instanceof Error ? result.message : result,
      {},
      { cause: result instanceof Error ? result : undefined }
    );
  }

  /**
   * Decides whether an OAuth2 sign-in has to be confirmed with the account password before it is honored. This is the
   * case the first time a provider account is linked to an existing user that already has a password, since anyone
   * able to create a provider account carrying that email address could otherwise take the account over. The rule is
   * not configurable: turning it off would hand over every password-protected account to whoever can present a
   * matching address.
   *
   * @param {AuthUser} authUser - The local user matched by email address.
   * @param {AuthSource} source - The OAuth2 authentication source.
   * @param {string} providerAccountId - The user identifier reported by the provider.
   * @return {Promise<boolean>} A promise resolving to true when the password has to be confirmed.
   */
  public async requiresPasswordConfirmation(
    authUser: AuthUser,
    source: AuthSource,
    providerAccountId: string
  ): Promise<boolean> {
    if (!authUser.passwordHash) {
      return false;
    }

    // Without the link table there is nothing to remember a previous confirmation, so asking every time is the only
    // way to keep the guarantee.
    if (!this._connectedAccountService) {
      return true;
    }

    const account = await this.findConnectedAccount(source, providerAccountId);

    return !account || this.connectedAccountOwnerId(account) !== authUser.id;
  }

  /**
   * Finds the connected account linking an OAuth2 provider account to a local user.
   *
   * @param {AuthSource} source - The OAuth2 authentication source.
   * @param {string} providerAccountId - The user identifier reported by the provider.
   * @return {Promise<ConnectedAccount | null>} A promise resolving to the link, or null when the provider account is
   * unknown or connected accounts are not being tracked.
   */
  public async findConnectedAccount(
    source: AuthSource,
    providerAccountId: string
  ): Promise<ConnectedAccount | null> {
    const service = this._connectedAccountService;
    if (!service) {
      return null;
    }

    try {
      return await withoutPolicies(() =>
        service.single({ provider: source, providerAccountId })
      );
    } catch (e) {
      throw toDatabaseError(e);
    }
  }

  /**
   * Records a successful OAuth2 sign-in, creating the link on the first one and refreshing it afterward. Does nothing
   * when connected accounts are not being tracked.
   *
   * @param {AuthUser} authUser - The local user the provider account belongs to.
   * @param {AuthSource} source - The OAuth2 authentication source.
   * @param {string} providerAccountId - The user identifier reported by the provider.
   * @param {string} [scope] - The scopes granted by the provider.
   * @return {Promise<void>} A promise that resolves once the link is stored.
   * @throws {OAuth2Error} `OAUTH2_ACCOUNT_CONFLICT` if the provider account is already linked to a different user.
   */
  public async linkConnectedAccount(
    authUser: AuthUser,
    source: AuthSource,
    providerAccountId: string,
    scope?: string
  ): Promise<void> {
    const service = this._connectedAccountService;
    if (!service) {
      return;
    }

    const account = await this.findConnectedAccount(source, providerAccountId);

    if (account && this.connectedAccountOwnerId(account) !== authUser.id) {
      throw new OAuth2Error(
        ErrorCode.OAuth2AccountConflict,
        'This provider account is already linked to another user'
      );
    }

    if (account) {
      try {
        await withoutPolicies(() =>
          service.update(account.id, { scope, lastLoginAt: new Date() })
        );
      } catch (e) {
        throw toDatabaseError(e);
      }
      return;
    }

    try {
      await withoutPolicies(() =>
        service.create({
          provider: source,
          providerAccountId,
          scope,
          lastLoginAt: new Date(),
          [uncapitalize(this._authUserService.modelName)]: { id: authUser.id }
        })
      );
    } catch (e) {
      // A concurrent sign-in may have created the link first, which the unique
      // constraint on the provider account rejects this one for
      const linked = await this.findConnectedAccount(
        source,
        providerAccountId
      ).catch(() => null);
      if (!linked) {
        throw toDatabaseError(e);
      }
      if (this.connectedAccountOwnerId(linked) !== authUser.id) {
        throw new OAuth2Error(
          ErrorCode.OAuth2AccountConflict,
          'This provider account is already linked to another user'
        );
      }
      return;
    }

    logger.debug({ id: authUser.id, source }, 'OAuth2 provider account linked');
  }

  /**
   * Reads the owning user id off a link, which the generated model exposes as a `<authModel>Id` foreign key.
   *
   * @internal
   */
  private connectedAccountOwnerId(
    account: ConnectedAccount
  ): ResourceId | undefined {
    return account[`${uncapitalize(this._authUserService.modelName)}Id`];
  }
}
