import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of sending an email. */
export class MailerError<
  C extends ModuleErrorCode<'MAILER'> = ModuleErrorCode<'MAILER'>
> extends AppweaverError<C> {
  public readonly module = 'mailer';
}
