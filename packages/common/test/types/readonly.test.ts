import { DeepReadonly } from '../../types/readonly';

type Order = {
  id: number;
  total: number;
  paidAt: Date | null;
  tags: string[];
  customer: { name: string; roles: { name: string }[] };
  meta: Map<string, { value: number }>;
  amount: { toNumber(): number; plus(n: number): unknown };
  format: () => string;
};

describe('readonly', () => {
  describe('DeepReadonly', () => {
    test('makes every depth readonly at compile time', () => {
      const order = {
        id: 1,
        total: 10,
        paidAt: new Date(0),
        tags: ['a'],
        customer: { name: 'Ana', roles: [{ name: 'admin' }] },
        meta: new Map([['a', { value: 1 }]]),
        amount: { toNumber: () => 10, plus: (n: number) => n },
        format: () => 'order'
      } as DeepReadonly<Order>;

      // The writes a listener must not make fail to compile
      const writes = [
        // @ts-expect-error a property
        () => (order.total = 2),
        // @ts-expect-error an array
        () => order.tags.push('b'),
        // @ts-expect-error a nested object
        () => (order.customer.name = 'Ivo'),
        // @ts-expect-error an array of nested objects
        () => (order.customer.roles[0].name = 'user'),
        // @ts-expect-error a map
        () => order.meta.set('b', { value: 2 })
      ];

      // The reads and the values kept as they are still compile
      const reads: unknown[] = [
        order.paidAt?.getTime(),
        order.amount.toNumber(),
        order.format(),
        order.customer.roles.map((role) => role.name),
        order.meta.get('a')?.value
      ];

      expect(writes).toHaveLength(5);
      expect(reads).toEqual([0, 10, 'order', ['admin'], 1]);
    });

    test('keeps an any as it is', () => {
      const value: DeepReadonly<any> = { a: 1 };
      value.a = 2;

      expect(value).toEqual({ a: 2 });
    });
  });
});
