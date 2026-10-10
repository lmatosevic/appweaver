import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of a data export. */
export class ExportError<
  C extends ModuleErrorCode<'EXPORT'> = ModuleErrorCode<'EXPORT'>
> extends AppweaverError<C> {
  public readonly module = 'export';
}
