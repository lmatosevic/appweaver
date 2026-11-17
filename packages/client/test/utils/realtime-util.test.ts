import {
  realtimeModuleType,
  realtimeSpec,
  schemaToType
} from '../../utils/realtime-util';
import { createOpenApiSchema } from '../fixtures/openapi-schema';
import { createRealtimeOpenApiSchema } from '../fixtures/realtime-spec';

describe('realtime-util', () => {
  describe('realtimeSpec', () => {
    test('reads the realtime extension', () => {
      expect(realtimeSpec(createRealtimeOpenApiSchema())?.routePrefix).toBe(
        '/api/realtime'
      );
    });

    test('returns nothing for an API without realtime routes', () => {
      expect(realtimeSpec(createOpenApiSchema())).toBeUndefined();
    });
  });

  describe('schemaToType', () => {
    test.each([
      [undefined, 'unknown'],
      [true, 'unknown'],
      [false, 'never'],
      [{}, 'unknown'],
      [{ const: 'a' }, '"a"'],
      [{ enum: ['a', 1] }, '"a" | 1'],
      [{ type: 'string' }, 'string'],
      [{ type: 'integer' }, 'number'],
      [{ type: 'number' }, 'number'],
      [{ type: 'boolean' }, 'boolean'],
      [{ type: 'null' }, 'null'],
      [{ type: 'void' }, 'void'],
      [{ type: 'undefined' }, 'undefined'],
      [{ type: ['string', 'null'] }, 'string | null'],
      [{ type: 'string', nullable: true }, 'string | null'],
      [{ type: 'array', items: { type: 'string' } }, 'string[]'],
      [
        {
          type: 'array',
          items: { anyOf: [{ type: 'string' }, { type: 'integer' }] }
        },
        '(string | number)[]'
      ],
      [
        { oneOf: [{ type: 'string' }, { type: 'boolean' }] },
        'string | boolean'
      ],
      [
        {
          allOf: [
            {
              type: 'object',
              properties: { a: { type: 'string' } },
              required: ['a']
            },
            { type: 'object', properties: { b: { type: 'integer' } } }
          ]
        },
        '{ a: string } & { b?: number }'
      ],
      [{ type: 'object' }, 'Record<string, never>'],
      [
        {
          type: 'object',
          properties: { 'a-b': { type: 'string' } },
          additionalProperties: { type: 'integer' }
        },
        '{ "a-b"?: string; [key: string]: number }'
      ],
      [
        { properties: { a: { type: 'string' } }, required: ['a'] },
        '{ a: string }'
      ]
    ])('converts %j to %s', (schema, type) => {
      expect(schemaToType(schema as never)).toBe(type);
    });
  });

  describe('realtimeModuleType', () => {
    test('types the channels, the resources, the actions and the streams', () => {
      const spec = realtimeSpec(createRealtimeOpenApiSchema())!;

      const type = realtimeModuleType(spec, 'export type PostSingle = {};');

      expect(type).toBe(
        'export type RealtimeModuleType = { channels: { "order.shipped": { payload: { orderId: number; carrier: string | null }; params: { orderId?: number } }; ping: { payload: unknown; params: undefined } }; ' +
          'resources: { Post: { actions: "create" | "update"; record: PostSingle }; Missing: { actions: "delete"; record: Record<string, unknown> } }; ' +
          'actions: { "chat.typing": { payload: { roomId: number; tags?: string[] }; response: { seen: boolean } }; cursor: { payload: Record<string, never>; response: unknown }; assistant: { payload: { prompt: string }; response: unknown; chunk: string } }; ' +
          'streams: { "room.answer": { chunk: string; params: { roomId: number } }; radio: { chunk: Uint8Array; params: undefined }; ticks: { chunk: { price: number }; params: undefined } } };'
      );
    });

    test('types a spec without any part', () => {
      expect(realtimeModuleType({ routePrefix: '/rt' } as never, '')).toBe(
        'export type RealtimeModuleType = { channels: {  }; resources: {  }; actions: {  }; streams: {  } };'
      );
    });
  });
});
