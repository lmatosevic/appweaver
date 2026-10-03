import { Application, createApp, injectService } from '@appweaver/core';
import { resetTestData } from './support/reset';

/**
 * The text search objects of the services against the real database: the
 * searched text replaces the placeholder, and the conditions listed in an OR
 * object make a valid database query.
 */
describe('Text search', () => {
  let app: Application;
  let posts: any;

  const search = async (searchText: string): Promise<string[]> =>
    (await posts.query({ filter: { searchText } })).items.map(
      (post: any) => post.slug
    );

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    posts = injectService('Post');

    await posts.client.deleteMany({});
    await posts.create({
      title: 'Walking the Velebit trail',
      slug: 'velebit-trail',
      excerpt: 'Five days along the coast'
    });
    await posts.create({
      title: 'Island hopping',
      slug: 'island-hopping',
      content: 'Ferries from Split to Vis'
    });
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('matches the title', async () => {
    expect(await search('Velebit')).toEqual(['velebit-trail']);
  });

  test('matches the other fields of the OR object', async () => {
    expect(await search('coast')).toEqual(['velebit-trail']);
    expect(await search('Ferries')).toEqual(['island-hopping']);
  });

  test('ignores the case of the searched text', async () => {
    expect(await search('ISLAND')).toEqual(['island-hopping']);
  });

  test('matches nothing for an unknown text', async () => {
    expect(await search('Dubrovnik')).toEqual([]);
  });
});
