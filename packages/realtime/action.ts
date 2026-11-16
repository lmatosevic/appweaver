import { TSchema } from '@sinclair/typebox';
import { RealtimeAction, RealtimeActionConfig } from './types';
import { createRegistry } from './utils/registry';

/** The key of the actions in the application context. */
export const REALTIME_ACTION = Symbol.for('appweaver.RealtimeAction');

const actions = createRegistry<RealtimeAction>(REALTIME_ACTION, 'action');

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
  return actions.add({
    name: config.name,
    config
  }) as RealtimeAction<P, R>;
}

/**
 * Lists the actions of the application and of the modules.
 *
 * @return {RealtimeAction[]} The actions.
 */
export function realtimeActions(): RealtimeAction[] {
  return actions.all();
}

/**
 * Finds an action by its name.
 *
 * @param {string} name - The name of the action.
 * @return {RealtimeAction | undefined} The action, or `undefined` when none has the name.
 */
export function findRealtimeAction(name: string): RealtimeAction | undefined {
  return actions.find(name);
}
