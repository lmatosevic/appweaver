import { Application, createApp, injectService } from '@appweaver/core';
import { PostSort } from '@/types/generated';
import { resetTestData } from './support/reset';

/**
 * Exercises cursor pagination against the real database, so the keyset queries
 * the cursors map to are proven to page correctly rather than only to carry the
 * expected shape.
 */
describe('Query cursor pagination', () => {
  let app: Application;
  let posts: any;
  let users: any;

  // The suite keeps a database connection open for its whole run, so the
  // between-test reset cannot drop the records and they are cleared here
  const seed = async () => {
    await posts.client.deleteMany({});
    await users.client.deleteMany({});

    const author = await users.client.create({
      data: {
        email: 'ana@example.com',
        firstName: 'Ana',
        lastName: 'Anic',
        phone: '01234431'
      }
    });

    // Two records share a counter value, so a sort that is not terminated by a
    // unique field would order them arbitrarily between pages
    const counters = [5, 4, 4, 3, 2, 1];
    for (const [index, counter] of counters.entries()) {
      await posts.create({
        title: `Post ${index + 1}`,
        slug: `post-${index + 1}`,
        counter,
        author: author.id
      });
    }
  };

  /** Reads a page and returns its slugs together with its cursors. */
  const page = async (
    cursor?: string,
    sort: PostSort = 'id',
    size: number = 2
  ) => {
    const result = await posts.query({}, 1, size, sort, cursor, false);
    return {
      slugs: result.items.map((item: any) => item.slug),
      next: result.nextCursor,
      prev: result.prevCursor,
      totalCount: result.totalCount
    };
  };

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    posts = injectService('Post');
    users = injectService('User');
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await seed();
  });

  test('walks the whole result forward one page at a time', async () => {
    const first = await page();
    expect(first.slugs).toEqual(['post-1', 'post-2']);
    expect(first.prev).toBeNull();

    const second = await page(first.next);
    expect(second.slugs).toEqual(['post-3', 'post-4']);

    const third = await page(second.next);
    expect(third.slugs).toEqual(['post-5', 'post-6']);

    // The last page has nothing following it, which ends the iteration
    expect(third.next).toBeNull();
    expect(third.prev).toBeDefined();
  });

  test('walks back to the first page with the prev cursors', async () => {
    const first = await page();
    const second = await page(first.next);
    const third = await page(second.next);

    const back = await page(third.prev);
    expect(back.slugs).toEqual(['post-3', 'post-4']);

    const start = await page(back.prev);
    expect(start.slugs).toEqual(['post-1', 'post-2']);
    expect(start.prev).toBeNull();
  });

  test('pages a descending sort in the same direction', async () => {
    const first = await page(undefined, '-id');
    expect(first.slugs).toEqual(['post-6', 'post-5']);

    const second = await page(first.next, '-id');
    expect(second.slugs).toEqual(['post-4', 'post-3']);
  });

  test('pages a sort with duplicate values without skipping a record', async () => {
    // post-2 and post-3 share the counter 4, so only the appended primary key
    // keeps them on stable sides of the page boundary
    const seen: string[] = [];
    let cursor: string | null = null;

    do {
      const result = await page(cursor, 'counter');
      seen.push(...result.slugs);
      cursor = result.next;
    } while (cursor);

    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
    expect(seen[0]).toBe('post-6');
  });

  test('pages a sort over a relation field', async () => {
    const first = await page(undefined, 'author.firstName,id');
    expect(first.slugs).toEqual(['post-1', 'post-2']);

    const second = await page(first.next, 'author.firstName,id');
    expect(second.slugs).toEqual(['post-3', 'post-4']);
  });

  test('pages a sort over a relation count', async () => {
    const first = await page(undefined, '-galleryImagesCount,id');
    expect(first.slugs).toEqual(['post-1', 'post-2']);

    const second = await page(first.next, '-galleryImagesCount,id');
    expect(second.slugs).toEqual(['post-3', 'post-4']);
  });

  test('counts the matching records only when asked to', async () => {
    const counted = await posts.query({}, 1, 2);
    expect(counted.totalCount).toBe(6);

    const uncounted = await posts.query({}, 1, 2, 'id', undefined, false);
    expect(uncounted.totalCount).toBeNull();
  });

  test('rejects a cursor issued for another filter', async () => {
    const first = await posts.query({}, 1, 2);

    await expect(
      posts.query({ counter: 4 }, 1, 2, '-createdAt', first.nextCursor)
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
