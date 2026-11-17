import { Type } from '@sinclair/typebox';
import { ErrorCode, PubSub } from '@appweaver/common';
import { define } from '@appweaver/core';
import { MemoryPubSub } from '@appweaver/core/drivers';
import { resetContext } from '@appweaver/testing';
import { createChannel, findChannel, realtimeChannels } from '../channel';

describe('channel', () => {
  beforeEach(() => {
    resetContext();
  });

  describe('createChannel', () => {
    test('defines a channel in the context', () => {
      const channel = createChannel({
        name: 'order.shipped',
        payload: Type.Object({ id: Type.Integer() })
      });

      expect(channel.name).toBe('order.shipped');
      expect(realtimeChannels()).toEqual([channel]);
      expect(findChannel('order.shipped')).toBe(channel);
      expect(findChannel('missing')).toBeUndefined();
    });

    test.each(['resource:Post', 'has space', '', '.dot'])(
      'refuses the name %j',
      (name) => {
        expect(() => createChannel({ name, payload: Type.Object({}) })).toThrow(
          expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
        );
      }
    );

    test('refuses a name already taken', () => {
      createChannel({ name: 'news', payload: Type.Object({}) });

      expect(() =>
        createChannel({ name: 'news', payload: Type.Object({}) })
      ).toThrow(/already defined/);
    });

    test('publishes a valid payload to the pub/sub', async () => {
      const pubsub = new MemoryPubSub();
      define(pubsub, PubSub);
      const publish = jest.spyOn(pubsub, 'publish');
      const channel = createChannel({
        name: 'news',
        payload: Type.Object({ title: Type.String() })
      });

      await channel.publish({ title: 'Hello' });

      expect(publish).toHaveBeenCalledWith('realtime:news', {
        eventId: expect.any(String),
        payload: { title: 'Hello' }
      });
      await expect(
        channel.publish({ title: 1 } as never)
      ).rejects.toMatchObject({ code: ErrorCode.RealtimePayloadInvalid });
    });

    test('publishes a payload with a date-time field', async () => {
      const pubsub = new MemoryPubSub();
      define(pubsub, PubSub);
      const publish = jest.spyOn(pubsub, 'publish');
      const channel = createChannel({
        name: 'movie.chat',
        payload: Type.Object({
          text: Type.String(),
          sentAt: Type.String({ format: 'date-time' })
        })
      });
      const payload = { text: 'Hi', sentAt: '2026-11-17T10:30:00.000Z' };

      await channel.publish(payload);

      expect(publish).toHaveBeenCalledWith('realtime:movie.chat', {
        eventId: expect.any(String),
        payload
      });
      await expect(
        channel.publish({ text: 'Hi', sentAt: 'yesterday' })
      ).rejects.toMatchObject({
        code: ErrorCode.RealtimePayloadInvalid,
        details: { errors: [expect.objectContaining({ path: '/sentAt' })] }
      });
    });
  });
});
