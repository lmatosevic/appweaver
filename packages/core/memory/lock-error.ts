import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of a lock on a shared resource. */
export class LockError<
  C extends ModuleErrorCode<'LOCK'> = ModuleErrorCode<'LOCK'>
> extends AppweaverError<C> {
  public readonly module = 'lock';
}
