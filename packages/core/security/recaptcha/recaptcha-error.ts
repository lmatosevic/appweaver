import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of a reCAPTCHA verification. */
export class RecaptchaError<
  C extends ModuleErrorCode<'RECAPTCHA'> = ModuleErrorCode<'RECAPTCHA'>
> extends AppweaverError<C> {
  public readonly module = 'recaptcha';
}
