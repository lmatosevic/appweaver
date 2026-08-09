import { Application, createApp, injectService } from '@appweaver/core';
import { PostAggregate } from '@/types/generated';
import { resetTestData } from './support/reset';

/**
 * Exercises the aggregate selection against the real database, so the Prisma
 * aggregation arguments it maps to are proven to be valid rather than only the
 * expected shape.
 */
describe('Aggregate selection', () => {
  let app: Application;
  let posts: any;

  const from = '2026-01-01T00:00:00.000Z';
  const to = '2026-01-03T00:00:00.000Z';

  // The suite keeps a database connection open for its whole run, so the
  // between-test reset cannot drop the records and they are cleared here
  const seed = async () => {
    await posts.client.deleteMany({});

    await posts.client.createMany({
      data: [
        {
          title: 'First post',
          slug: 'first-post',
          counter: 3,
          tags: 'Nature',
          createdAt: new Date('2026-01-01T10:00:00.000Z')
        },
        {
          title: 'Second post',
          slug: 'second-post',
          counter: 7,
          tags: 'Animals',
          createdAt: new Date('2026-01-02T10:00:00.000Z')
        }
      ]
    });
  };

  /** Aggregates the seeded range with the given selection. */
  const aggregate = async (select: PostAggregate): Promise<any> =>
    posts.aggregate({}, select, 'createdAt', from, to);

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    posts = injectService('Post');
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await seed();
  });

  test('aggregates a numeric field with every operator', async () => {
    const result = await aggregate({
      counter: { count: true, sum: true, avg: true, min: true, max: true }
    });

    expect(result.total.counter).toEqual({
      count: 2,
      sum: 10,
      avg: 5,
      min: 3,
      max: 7
    });
  });

  test('aggregates a date field with its ordering operators', async () => {
    const result = await aggregate({ createdAt: { count: true, min: true } });

    expect(result.total.createdAt.count).toBe(2);
    expect(new Date(result.total.createdAt.min).toISOString()).toBe(
      '2026-01-01T10:00:00.000Z'
    );
  });

  test('aggregates several fields at once', async () => {
    const result = await aggregate({
      id: { count: true },
      counter: { sum: true }
    });

    expect(result.total).toEqual({ id: { count: 2 }, counter: { sum: 10 } });
  });

  test('splits the range into periods', async () => {
    const result = await aggregate({ counter: { sum: true } });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].result.counter.sum).toBe(3);
    expect(result.items[1].result.counter.sum).toBe(7);
  });

  test('takes the values of the boundary records of the range', async () => {
    const result = await aggregate({
      counter: { first: true, last: true },
      createdAt: { first: true, last: true }
    });

    expect(result.total.counter).toEqual({ first: 3, last: 7 });
    expect(new Date(result.total.createdAt.first).toISOString()).toBe(
      '2026-01-01T10:00:00.000Z'
    );
    expect(new Date(result.total.createdAt.last).toISOString()).toBe(
      '2026-01-02T10:00:00.000Z'
    );
  });

  test('takes the boundary values of every period on its own', async () => {
    const result = await aggregate({ counter: { first: true, last: true } });

    expect(result.items[0].result.counter).toEqual({ first: 3, last: 3 });
    expect(result.items[1].result.counter).toEqual({ first: 7, last: 7 });
  });

  test('resolves the boundary values of an empty period to null', async () => {
    await posts.client.deleteMany({});

    const result = await aggregate({ counter: { sum: true, first: true } });

    expect(result.total.counter).toEqual({ sum: null, first: null });
    expect(result.items[0].result.counter.first).toBeNull();
  });

  test('breaks the ties of the records sharing a date by their id', async () => {
    const sameDate = new Date('2026-01-01T12:00:00.000Z');
    await posts.client.deleteMany({});
    await posts.client.createMany({
      data: [
        {
          title: 'A',
          slug: 'a',
          counter: 1,
          tags: 'Nature',
          createdAt: sameDate
        },
        {
          title: 'B',
          slug: 'b',
          counter: 2,
          tags: 'Nature',
          createdAt: sameDate
        }
      ]
    });

    const result = await aggregate({ counter: { first: true, last: true } });

    expect(result.total.counter).toEqual({ first: 1, last: 2 });
  });

  test('aggregates the boundary values alongside the database operators', async () => {
    const result = await aggregate({
      counter: { count: true, sum: true, min: true, first: true, last: true }
    });

    expect(result.total.counter).toEqual({
      count: 2,
      sum: 10,
      min: 3,
      first: 3,
      last: 7
    });
  });

  test('rejects a field that cannot be aggregated', async () => {
    await expect(
      posts.aggregate({}, { title: { count: true } } as any)
    ).rejects.toThrow(/not a numeric or date field/);
  });

  test('rejects an operator the field does not support', async () => {
    await expect(
      posts.aggregate({}, { createdAt: { sum: true } } as any)
    ).rejects.toThrow(/Cannot apply the 'sum' operator/);
  });

  test('rejects an empty selection', async () => {
    await expect(posts.aggregate({}, {} as any)).rejects.toThrow(
      /at least one field with a selected aggregation operator/
    );
  });
});
