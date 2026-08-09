import { Application, createApp, injectService } from '@appweaver/core';
import { PostSort } from '@/types/generated';
import { resetTestData } from './support/reset';

/**
 * Exercises the sort input of the query action against the real database, so
 * the `orderBy` clauses it maps to are proven to be valid database queries
 * rather than only the expected shape.
 */
describe('Query sort input', () => {
  let app: Application;
  let posts: any;
  let users: any;

  // The suite keeps a database connection open for its whole run, so the
  // between-test reset cannot drop the records and they are cleared here
  const seed = async () => {
    await posts.client.deleteMany({});
    await users.client.deleteMany({});

    const [ana, bob] = await Promise.all([
      users.client.create({
        data: {
          email: 'ana@example.com',
          firstName: 'Ana',
          lastName: 'Anic',
          phone: '01234431'
        }
      }),
      users.client.create({
        data: {
          email: 'bob@example.com',
          firstName: 'Bob',
          lastName: 'Boric',
          phone: '01234432'
        }
      })
    ]);

    await posts.create({
      title: 'First post',
      slug: 'first-post',
      counter: 3,
      author: bob.id
    });
    await posts.create({
      title: 'Second post',
      slug: 'second-post',
      counter: 1,
      author: ana.id
    });
    await posts.create({
      title: 'Third entry',
      slug: 'third-entry',
      counter: 2,
      author: bob.id
    });
  };

  /** Queries with the given sort input and returns the resulting slugs. */
  const slugs = async (sort: PostSort): Promise<string[]> => {
    const result = await posts.query({}, 1, 50, sort);
    return result.items.map((item: any) => item.slug);
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

  test('sorts by a field list string', async () => {
    await expect(slugs('-counter')).resolves.toEqual([
      'first-post',
      'third-entry',
      'second-post'
    ]);
  });

  test('sorts by a sort object', async () => {
    await expect(slugs({ counter: 'asc' })).resolves.toEqual([
      'second-post',
      'third-entry',
      'first-post'
    ]);
  });

  test('sorts by a relation field given with a dot notation', async () => {
    await expect(slugs('author.firstName,-counter')).resolves.toEqual([
      'second-post',
      'first-post',
      'third-entry'
    ]);
  });

  test('sorts by two fields of the same relation', async () => {
    // A database order entry accepts a single field path, so each field of the
    // relation has to become an entry of its own
    await expect(
      slugs({ author: { firstName: 'asc', lastName: 'desc' } })
    ).resolves.toEqual(['second-post', 'first-post', 'third-entry']);
  });

  test('sorts by a relation field given as a nested object', async () => {
    await expect(
      slugs({ author: { firstName: 'desc' }, counter: 'asc' })
    ).resolves.toEqual(['third-entry', 'first-post', 'second-post']);
  });

  test('sorts by the file count of a relation', async () => {
    await expect(slugs('-galleryImagesCount,slug')).resolves.toEqual([
      'first-post',
      'second-post',
      'third-entry'
    ]);
  });

  test('rejects a field of a list relation', async () => {
    await expect(posts.query({}, 1, 50, 'galleryImages.name')).rejects.toThrow(
      /holds a list of records/
    );
  });

  test('rejects an unknown sort field', async () => {
    await expect(posts.query({}, 1, 50, { unknown: 'asc' })).rejects.toThrow(
      /is not a sortable field/
    );
  });
});
