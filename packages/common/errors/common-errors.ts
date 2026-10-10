import { AppweaverError } from './appweaver-error';
import { ModuleErrorCode, RequestErrorCode } from './error-code';

/**
 * A request rejected as a whole, before or apart from a module handling it,
 * i.e. a validation failure with the invalid fields as its details.
 */
export class RequestError<
  C extends RequestErrorCode = RequestErrorCode
> extends AppweaverError<C> {
  public readonly module = 'request';
}

/** An invalid configuration, model definition or other setup of the application. */
export class ConfigurationError<
  C extends ModuleErrorCode<'CONFIGURATION'> = ModuleErrorCode<'CONFIGURATION'>
> extends AppweaverError<C> {
  public readonly module = 'configuration';
}

/**
 * An error of the application itself, with a code of its own. The API maps
 * the code to an HTTP status registered with `defineErrors` of `@appweaver/core`,
 * and to a 500 status when it is not registered.
 *
 * @example
 * throw new ApplicationError('OUT_OF_STOCK', 'Product is out of stock', { productId });
 */
export class ApplicationError<
  C extends string = string
> extends AppweaverError<C> {
  public readonly module = 'application';
}
