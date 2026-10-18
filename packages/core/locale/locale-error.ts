import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of loading the translations. */
export class LocaleError<
  C extends ModuleErrorCode<'LOCALE'> = ModuleErrorCode<'LOCALE'>
> extends AppweaverError<C> {
  public readonly module = 'locale';
}
