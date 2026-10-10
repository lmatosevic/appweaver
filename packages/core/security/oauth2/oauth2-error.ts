import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of an OAuth2 sign-in, i.e. a failed provider request. */
export class OAuth2Error<
  C extends ModuleErrorCode<'OAUTH2'> = ModuleErrorCode<'OAUTH2'>
> extends AppweaverError<C> {
  public readonly module = 'oauth2';
}
