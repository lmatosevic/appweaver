import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of the authentication or the authorization of a user. */
export class AuthError<
  C extends ModuleErrorCode<'AUTH'> = ModuleErrorCode<'AUTH'>
> extends AppweaverError<C> {
  public readonly module = 'auth';
}
