import { TSchema } from '@sinclair/typebox';
import { ConfigurationError, createLogger, ErrorCode } from '@appweaver/common';
import { define, injectAll } from '@appweaver/core';
import { RealtimeAction, RealtimeActionConfig } from './types';

const logger = createLogger('realtime');

/** The key of the actions in the application context. */
export const REALTIME_ACTION = Symbol.for('appweaver.RealtimeAction');

const NAME_PATTERN = /^[a-zA-Z0-9][\w.:-]{0,127}$/;

/**
 * Creates an action the clients call over the WebSocket, with or without waiting for its result, or with a
 * `POST <prefix>/actions/<name>` request. The handler runs as the user of the connection or the request, so the
 * policies of the resources apply to what it does. The actions are for the custom operations of the application,
 * never for the CRUD of a resource, which goes through its routes.
 *
 * @example
 * createRealtimeAction({
 *   name: 'chat.typing',
 *   payload: Type.Object({ roomId: Type.Integer() }),
 *   handler: async ({ roomId }, { user }) => typing.publish({ roomId, userId: user!.id })
 * });
 *
 * @param {RealtimeActionConfig} config - The name, the schemas, the access and the handler of the action.
 * @return {RealtimeAction} The action, defined in the application context.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` for an invalid name, or one already taken.
 */
export function createRealtimeAction<
  P extends TSchema,
  R extends TSchema = TSchema
>(config: RealtimeActionConfig<P, R>): RealtimeAction<P, R> {
  if (!NAME_PATTERN.test(config.name)) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `Invalid realtime action name '${config.name}'`
    );
  }
  if (findRealtimeAction(config.name)) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `Realtime action '${config.name}' is already defined`
    );
  }

  const action: RealtimeAction<P, R> = { name: config.name, config };

  // Wrapped in an object, since the context would instantiate a function
  define({ action }, REALTIME_ACTION, 'append');
  logger.debug({ action: config.name }, 'Created realtime action');

  return action;
}

/**
 * Lists the actions of the application and of the modules.
 *
 * @return {RealtimeAction[]} The actions.
 */
export function realtimeActions(): RealtimeAction[] {
  return injectAll<{ action: RealtimeAction }>(REALTIME_ACTION).map(
    (entry) => entry.action
  );
}

/**
 * Finds an action by its name.
 *
 * @param {string} name - The name of the action.
 * @return {RealtimeAction | undefined} The action, or `undefined` when none has the name.
 */
export function findRealtimeAction(name: string): RealtimeAction | undefined {
  return realtimeActions().find((action) => action.name === name);
}
