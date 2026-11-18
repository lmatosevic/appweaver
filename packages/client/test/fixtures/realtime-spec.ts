import { OpenAPI3 } from 'openapi-typescript';
import { createOpenApiSchema } from './openapi-schema';

/** The OpenAPI schema of the fixture, with the realtime routes and the `x-appweaver-realtime` extension. */
export function createRealtimeOpenApiSchema(): OpenAPI3 {
  const schema = createOpenApiSchema() as OpenAPI3 & Record<string, unknown>;
  const response = {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: { type: 'object' } } }
    }
  };
  schema.paths!['/api/realtime/ticket'] = {
    post: { responses: response }
  } as never;
  schema.paths!['/api/realtime/actions/{name}'] = {
    post: { responses: response }
  } as never;
  schema['x-appweaver-realtime'] = {
    routePrefix: '/api/realtime',
    transports: ['sse', 'websocket'],
    anonymous: false,
    channels: [
      {
        name: 'order.shipped',
        public: false,
        payload: {
          type: 'object',
          properties: {
            orderId: { type: 'integer' },
            carrier: { anyOf: [{ type: 'string' }, { type: 'null' }] }
          },
          required: ['orderId', 'carrier']
        },
        params: {
          type: 'object',
          properties: { orderId: { type: 'integer' } }
        }
      },
      { name: 'ping', public: true, payload: {} }
    ],
    resources: [
      {
        model: 'Post',
        channel: 'resource:Post',
        actions: [
          { action: 'create', public: false },
          { action: 'update', public: true }
        ]
      },
      {
        model: 'Missing',
        channel: 'resource:Missing',
        actions: ['delete'],
        public: false
      }
    ],
    actions: [
      {
        name: 'chat.typing',
        public: false,
        payload: {
          type: 'object',
          properties: {
            roomId: { type: 'integer' },
            tags: { type: 'array', items: { type: 'string' } }
          },
          required: ['roomId']
        },
        response: {
          type: 'object',
          properties: { seen: { type: 'boolean' } },
          required: ['seen']
        }
      },
      {
        name: 'cursor',
        public: false,
        payload: { type: 'object', properties: {} }
      },
      {
        name: 'assistant',
        public: false,
        payload: {
          type: 'object',
          properties: { prompt: { type: 'string' } },
          required: ['prompt']
        },
        stream: { codec: 'text' }
      }
    ],
    streams: [
      {
        name: 'room.answer',
        channel: 'stream:room.answer',
        public: false,
        codec: 'text',
        params: {
          type: 'object',
          properties: { roomId: { type: 'integer' } },
          required: ['roomId']
        }
      },
      {
        name: 'radio',
        channel: 'stream:radio',
        public: true,
        codec: 'binary',
        mimeType: 'audio/mpeg'
      },
      {
        name: 'ticks',
        channel: 'stream:ticks',
        public: false,
        codec: 'json',
        chunk: {
          type: 'object',
          properties: { price: { type: 'number' } },
          required: ['price']
        }
      }
    ]
  };
  return schema;
}
