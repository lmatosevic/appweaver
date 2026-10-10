import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of a resource operation, i.e. a resource that is not found or an invalid query. */
export class ResourceError<
  C extends ModuleErrorCode<'RESOURCE'> = ModuleErrorCode<'RESOURCE'>
> extends AppweaverError<C> {
  public readonly module = 'resource';
}
