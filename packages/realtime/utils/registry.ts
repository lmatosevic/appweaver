import { ConfigurationError, createLogger, ErrorCode } from '@appweaver/common';
import { define, injectAll } from '@appweaver/core';

const logger = createLogger('realtime');

const NAME_PATTERN = /^[a-zA-Z0-9][\w.:-]{0,127}$/;

/** The definitions of a kind, a channel or an action, kept in the application context under a symbol. */
export type Registry<T extends { name: string }> = {
  /** Defines an item, refusing an invalid name or one already taken. */
  add(item: T): T;
  /** Lists the items. */
  all(): T[];
  /** Finds an item by its name. */
  find(name: string): T | undefined;
};

/**
 * Creates the registry of the channels or the actions, defined in the application context so a test resets them with
 * the context.
 *
 * @param {symbol} key - The key of the items in the context.
 * @param {string} kind - The kind of the items, naming them in the errors and the logs.
 * @param {Function} [invalid] - Returns true for a name the kind refuses besides the pattern of every name.
 * @return {Registry} The registry.
 */
export function createRegistry<T extends { name: string }>(
  key: symbol,
  kind: string,
  invalid: (name: string) => boolean = () => false
): Registry<T> {
  const all = () => injectAll<{ item: T }>(key).map((entry) => entry.item);
  const find = (name: string) => all().find((item) => item.name === name);

  return {
    all,
    find,
    add: (item) => {
      if (!NAME_PATTERN.test(item.name) || invalid(item.name)) {
        throw new ConfigurationError(
          ErrorCode.ConfigurationInvalid,
          `Invalid realtime ${kind} name '${item.name}'`
        );
      }
      if (find(item.name)) {
        throw new ConfigurationError(
          ErrorCode.ConfigurationInvalid,
          `Realtime ${kind} '${item.name}' is already defined`
        );
      }

      // Wrapped in an object, since the context would instantiate a function
      define({ item }, key, 'append');
      logger.debug({ [kind]: item.name }, `Created realtime ${kind}`);
      return item;
    }
  };
}
