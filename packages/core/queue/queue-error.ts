import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of a queue, i.e. a job sent to a closed queue. */
export class QueueError<
  C extends ModuleErrorCode<'QUEUE'> = ModuleErrorCode<'QUEUE'>
> extends AppweaverError<C> {
  public readonly module = 'queue';
}
