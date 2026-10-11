import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of a Cloudflare Turnstile verification. */
export class TurnstileError<
  C extends ModuleErrorCode<'TURNSTILE'> = ModuleErrorCode<'TURNSTILE'>
> extends AppweaverError<C> {
  public readonly module = 'turnstile';
}
