import { RealtimeAccess } from '@appweaver/common';
import { TSchema } from '@sinclair/typebox';
import { serverConfig } from '@appweaver/web/config';
import { context } from '@appweaver/core/internal';
import { realtimeActions } from '../action';
import { realtimeChannels, RESOURCE_CHANNEL_PREFIX } from '../channel';
import { realtimeConfig } from '../config';
import { resourceEventActions } from '../utils/resource-events';

/** The `x-appweaver-realtime` extension of the OpenAPI document, typing the realtime client the client generates. */
export type RealtimeSpec = {
  /** The path of the realtime routes, i.e. `/api/realtime` */
  routePrefix: string;
  /** The enabled transports */
  transports: ('sse' | 'websocket')[];
  /** Whether a connection without a ticket is allowed */
  anonymous: boolean;
  /** The channels of the application and of the modules */
  channels: (SpecAccess & {
    name: string;
    description?: string;
    payload: TSchema;
    params?: TSchema;
  })[];
  /** The models exposing their resource events, as the `resource:<model>` channels, with the access of every action */
  resources: {
    model: string;
    channel: string;
    actions: (SpecAccess & { action: string })[];
  }[];
  /** The actions */
  actions: (SpecAccess & {
    name: string;
    description?: string;
    payload: TSchema;
    response?: TSchema;
  })[];
};

type SpecAccess = Required<Pick<RealtimeAccess, 'public'>> &
  Pick<RealtimeAccess, 'roles' | 'permissions'>;

/**
 * Builds the `x-appweaver-realtime` extension of the OpenAPI document: the routes, the channels with the schemas of
 * their payloads and parameters, the resource channels and the actions.
 *
 * @return {RealtimeSpec} The extension.
 */
export function realtimeSpec(): RealtimeSpec {
  const routePrefix = [serverConfig.API_PREFIX, realtimeConfig.ROUTE_PREFIX]
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');

  return {
    routePrefix,
    transports: [
      ...(realtimeConfig.SSE_ENABLED ? (['sse'] as const) : []),
      ...(realtimeConfig.WEBSOCKET_ENABLED ? (['websocket'] as const) : [])
    ],
    anonymous: realtimeConfig.ANONYMOUS_ENABLED,
    channels: realtimeChannels().map(({ name, config }) => ({
      name,
      ...(config.description ? { description: config.description } : {}),
      ...access(config),
      payload: plain(config.payload),
      ...(config.params ? { params: plain(config.params) } : {})
    })),
    resources: [...context.resource.routes.entries()]
      .filter(([, routes]) => routes.config.events?.actions.length)
      .map(([model, routes]) => ({
        model: String(model),
        channel: RESOURCE_CHANNEL_PREFIX + String(model),
        actions: [...resourceEventActions(routes.config.events!)].map(
          ([action, config]) => ({ action, ...access(config) })
        )
      })),
    actions: realtimeActions().map(({ name, config }) => ({
      name,
      ...(config.description ? { description: config.description } : {}),
      ...access(config),
      payload: plain(config.payload),
      ...(config.response ? { response: plain(config.response) } : {})
    }))
  };
}

function access(config: RealtimeAccess): SpecAccess {
  return {
    public: config.public === true,
    ...(!config.public && config.roles ? { roles: config.roles } : {}),
    ...(!config.public && config.permissions
      ? { permissions: config.permissions }
      : {})
  };
}

/** A schema without the symbols of TypeBox, as it is written to the document. */
function plain(schema: TSchema): TSchema {
  return JSON.parse(JSON.stringify(schema));
}
