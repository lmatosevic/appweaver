import { AppweaverError, ModuleErrorCode } from '@appweaver/common';

/** An error of loading or rendering a template. */
export class TemplateError<
  C extends ModuleErrorCode<'TEMPLATE'> = ModuleErrorCode<'TEMPLATE'>
> extends AppweaverError<C> {
  public readonly module = 'template';
}
