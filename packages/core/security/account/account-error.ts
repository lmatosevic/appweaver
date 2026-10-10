import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of an account operation, i.e. an email verification or a password reset. */
export class AccountError<
  C extends ModuleErrorCode<'ACCOUNT'> = ModuleErrorCode<'ACCOUNT'>
> extends AppweaverError<C> {
  public readonly module = 'account';
}
