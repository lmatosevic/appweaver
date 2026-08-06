import { Application, createApp, injectService } from '@appweaver/core';
import { PostQuery } from '@/types/generated';
import { resetTestData } from './support/reset';

/**
 * Exercises the query filter operators against the real database, so the
 * conditions they map to are proven to be valid database queries rather than
 * only the expected shape.
 */
describe('Query filter operators', () => {
  let app: Application;
  let posts: any;
  // The ids the seeded records were given, keyed by slug. They are read back
  // from the created records, since the id sequence keeps counting up across
  // the runs of the suite.
  let id: Record<string, number>;

  // The suite keeps a database connection open for its whole run, so the
  // between-test reset cannot drop the records and they are cleared here
  const seed = async () => {
    await posts.client.deleteMany({});

    const created = await Promise.all([
      posts.create({
        title: 'First post',
        slug: 'first-post',
        content: 'Alpha content',
        status: 'Published',
        tags: 'Nature'
      }),
      posts.create({
        title: 'Second post',
        slug: 'second-post',
        content: 'Beta content',
        status: 'Draft',
        tags: 'Animals'
      }),
      posts.create({
        title: 'Third entry',
        slug: 'third-entry',
        status: 'Archived',
        tags: 'Nature'
      })
    ]);

    id = Object.fromEntries(created.map((post: any) => [post.slug, post.id]));
  };

  /** Queries with the given filter and returns the matched slugs, sorted. */
  const slugs = async (filter: PostQuery): Promise<string[]> => {
    const result = await posts.query(filter, 1, 50, 'slug');
    return result.items.map((item: any) => item.slug);
  };

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

  test('matches an equality condition', async () => {
    await expect(slugs({ title: { _eq: 'First post' } })).resolves.toEqual([
      'first-post'
    ]);
  });

  test('matches a negated equality condition', async () => {
    await expect(slugs({ status: { _ne: 'Draft' } })).resolves.toEqual([
      'first-post',
      'third-entry'
    ]);
  });

  test('matches the comparison conditions on the id', async () => {
    await expect(
      slugs({ id: { _gt: id['first-post'], _lte: id['second-post'] } })
    ).resolves.toEqual(['second-post']);
  });

  test('matches an inclusion condition', async () => {
    await expect(
      slugs({ status: { _in: ['Published', 'Archived'] } })
    ).resolves.toEqual(['first-post', 'third-entry']);
  });

  test('matches an exclusion condition', async () => {
    await expect(slugs({ status: { _nin: ['Draft'] } })).resolves.toEqual([
      'first-post',
      'third-entry'
    ]);
  });

  test('matches an inclusive range condition', async () => {
    await expect(
      slugs({ id: { _between: [id['second-post'], id['third-entry']] } })
    ).resolves.toEqual(['second-post', 'third-entry']);
  });

  test('matches the like patterns', async () => {
    await expect(slugs({ title: { _like: 'First%' } })).resolves.toEqual([
      'first-post'
    ]);
    await expect(slugs({ title: { _like: '%post' } })).resolves.toEqual([
      'first-post',
      'second-post'
    ]);
    await expect(slugs({ title: { _like: '%ir%' } })).resolves.toEqual([
      'first-post',
      'third-entry'
    ]);
    await expect(slugs({ title: { _like: 'First post' } })).resolves.toEqual([
      'first-post'
    ]);
  });

  test('matches the string conditions', async () => {
    await expect(slugs({ slug: { _starts: 'first' } })).resolves.toEqual([
      'first-post'
    ]);
    await expect(slugs({ slug: { _ends: 'entry' } })).resolves.toEqual([
      'third-entry'
    ]);
    await expect(slugs({ slug: { _contains: 'post' } })).resolves.toEqual([
      'first-post',
      'second-post'
    ]);
  });

  test('matches the exists condition on a nullable field', async () => {
    await expect(slugs({ content: { _exists: true } })).resolves.toEqual([
      'first-post',
      'second-post'
    ]);
    await expect(slugs({ content: { _exists: false } })).resolves.toEqual([
      'third-entry'
    ]);
  });

  test('merges several conditions on one field', async () => {
    await expect(
      slugs({ title: { _contains: 'post', _ne: 'First post' } })
    ).resolves.toEqual(['second-post']);
  });

  test('matches a field negation', async () => {
    await expect(
      slugs({ title: { _not: { _contains: 'post' } } })
    ).resolves.toEqual(['third-entry']);
  });

  test('combines conditions with the and operator', async () => {
    await expect(
      slugs({
        _and: {
          tags: 'Nature',
          status: { _eq: 'Published' }
        }
      })
    ).resolves.toEqual(['first-post']);
  });

  test('combines conditions with the or operator', async () => {
    await expect(
      slugs({
        _or: [{ status: 'Draft' }, { title: { _like: 'Third%' } }]
      })
    ).resolves.toEqual(['second-post', 'third-entry']);
  });

  test('excludes conditions with the not operator', async () => {
    await expect(slugs({ _not: { tags: 'Nature' } })).resolves.toEqual([
      'second-post'
    ]);
  });

  test('nests the logical operators', async () => {
    await expect(
      slugs({
        _and: {
          _or: [{ status: 'Published' }, { status: 'Archived' }],
          title: { _contains: 'post' }
        }
      })
    ).resolves.toEqual(['first-post']);
  });

  test('matches plain value shorthands', async () => {
    await expect(slugs({ status: 'Draft' })).resolves.toEqual(['second-post']);
    await expect(
      slugs({ id: [id['first-post'], id['second-post']] })
    ).resolves.toEqual(['first-post', 'second-post']);
  });

  test('matches the exists condition on a single relation', async () => {
    await expect(slugs({ author: { _exists: false } })).resolves.toEqual([
      'first-post',
      'second-post',
      'third-entry'
    ]);
    await expect(slugs({ author: { _exists: true } })).resolves.toEqual([]);
  });

  test('returns no results for a non-matching filter', async () => {
    await expect(slugs({ title: { _eq: 'Missing' } })).resolves.toEqual([]);
  });
});
