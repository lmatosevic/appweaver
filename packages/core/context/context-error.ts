import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of the application context, i.e. a definition that is not found. */
export class ContextError<
  C extends ModuleErrorCode<'CONTEXT'> = ModuleErrorCode<'CONTEXT'>
> extends AppweaverError<C> {
  public readonly module = 'context';
}
