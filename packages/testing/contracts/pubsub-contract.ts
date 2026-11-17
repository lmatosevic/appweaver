import { PubSub } from '@appweaver/common';
import { ContractFactory, runner, wait } from './contract-util';

/**
 * Tests a `PubSub` driver against the behavior every driver shares, with the `describe` and `test` globals of Jest,
 * Vitest or Bun. Each test gets a fresh instance, destroyed after it.
 *
 * @param {string} name - The name of the driver, i.e. `RedisPubSub`.
 * @param {ContractFactory<PubSub>} create - Creates the driver.
 */
export function testPubSubContract(
  name: string,
  create: ContractFactory<PubSub>
): void {
  const { describe, test, expect, beforeEach, afterEach } = runner();

  describe(`${name} implements the PubSub contract`, () => {
    let pubsub: PubSub;

    const received = (channel: string) => {
      const messages: unknown[] = [];
      const subscription = pubsub.subscribe(channel, (message) => {
        messages.push(message);
      });
      return { messages, subscription };
    };

    beforeEach(async () => {
      pubsub = await create();
    });

    afterEach(async () => {
      await pubsub.onDestroy();
    });

    test('delivers a message to every subscriber of its channel', async () => {
      const first = received('contract-orders');
      const second = received('contract-orders');
      await Promise.all([first.subscription, second.subscription]);

      await pubsub.publish('contract-orders', { id: 1 });
      await wait(50);

      expect(first.messages).toEqual([{ id: 1 }]);
      expect(second.messages).toEqual([{ id: 1 }]);
    });

    test('delivers no message of another channel', async () => {
      const other = received('contract-other');
      await other.subscription;

      await pubsub.publish('contract-orders', { id: 1 });
      await wait(50);

      expect(other.messages).toEqual([]);
    });

    test('delivers a JSON copy of the message', async () => {
      const copies = received('contract-copies');
      await copies.subscription;
      const message = { at: new Date('2026-01-01T00:00:00.000Z'), list: [1] };

      await pubsub.publish('contract-copies', message);
      await wait(50);

      expect(copies.messages).toEqual([
        { at: '2026-01-01T00:00:00.000Z', list: [1] }
      ]);
      expect(copies.messages[0]).not.toBe(message);
    });

    test('stops delivering to a removed subscription', async () => {
      const removed = received('contract-removed');
      const kept = received('contract-removed');
      const id = await removed.subscription;
      await kept.subscription;

      await expect(pubsub.unsubscribe(id)).resolves.toBe(true);
      await pubsub.publish('contract-removed', 'after');
      await wait(50);

      expect(removed.messages).toEqual([]);
      expect(kept.messages).toEqual(['after']);
    });

    test('reports an unknown subscription', async () => {
      await expect(pubsub.unsubscribe('unknown')).resolves.toBe(false);
    });

    test('keeps delivering after a failed subscriber', async () => {
      await pubsub.subscribe('contract-failures', () => {
        throw new Error('broken');
      });
      const kept = received('contract-failures');
      await kept.subscription;

      await pubsub.publish('contract-failures', 1);
      await pubsub.publish('contract-failures', 2);
      await wait(50);

      expect(kept.messages).toEqual([1, 2]);
    });
  });
}
