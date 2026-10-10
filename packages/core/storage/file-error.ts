import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of a file operation, i.e. a file that is not found or exceeds a limit. */
export class FileError<
  C extends ModuleErrorCode<'FILE'> = ModuleErrorCode<'FILE'>
> extends AppweaverError<C> {
  public readonly module = 'file';
}
