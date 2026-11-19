import { AsyncQueue } from '../../utils/async-queue';

describe('async-queue', () => {
  describe('AsyncQueue', () => {
    test('yields the values pushed before and while it is read', async () => {
      const queue = new AsyncQueue<number>();
      queue.push(1);
      const read = (async () => {
        const values: number[] = [];
        for await (const value of queue) {
          values.push(value);
        }
        return values;
      })();
      await new Promise(setImmediate);
      queue.push(2);
      queue.end();
      queue.push(3);

      await expect(read).resolves.toEqual([1, 2]);
    });

    test('throws its error once its values are read', async () => {
      const queue = new AsyncQueue<number>();
      queue.push(1);
      queue.fail(new Error('Lost'));
      queue.fail(new Error('Ignored'));

      const values: number[] = [];
      await expect(
        (async () => {
          for await (const value of queue) {
            values.push(value);
          }
        })()
      ).rejects.toThrow('Lost');
      expect(values).toEqual([1]);
    });
  });
});
