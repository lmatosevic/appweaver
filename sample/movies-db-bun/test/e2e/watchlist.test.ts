import { beforeAll, describe, expect, test } from 'bun:test';
import { Application } from '@appweaver/core';
import { testApp } from './support/app';
import {
  account,
  createRoles,
  movie,
  request,
  signIn
} from './support/fixtures';

/** The watchlist over HTTP, private to every member. */
describe('Watchlist', () => {
  let app: Application;
  let ana: Record<string, string>;
  let ben: Record<string, string>;

  const add = (auth: Record<string, string>, movieId: string) =>
    request(app, 'POST', '/watchlist', { auth, payload: { movie: movieId } });

  beforeAll(async () => {
    app = await testApp();
    await createRoles();

    ana = await signIn(app, await account('Ada'));
    ben = await signIn(app, await account('Bob'));
  }, 30_000);

  test('lists the own entries only', async () => {
    const planned = await movie('Listed Arrival');
    await add(ana, planned.id);
    await add(ben, planned.id);

    const { body } = await request(app, 'POST', '/watchlist/query', {
      auth: ana,
      payload: {}
    });

    expect(body.items.map((item: any) => item.movie.title)).toEqual([
      'Listed Arrival'
    ]);
    expect(body.totalCount).toBe(1);
  });

  test('dates an entry marked as watched', async () => {
    const watched = await movie('Listed Parasite');
    const entry = await add(ana, watched.id);

    const { body } = await request(app, 'PUT', `/watchlist/${entry.body.id}`, {
      auth: ana,
      payload: { status: 'Watched' }
    });

    expect(body.status).toBe('Watched');
    expect(body.watchedAt).toBeString();
  });

  test('refuses the same movie twice', async () => {
    const twice = await movie('Listed Inception');
    await add(ana, twice.id);

    const { status } = await add(ana, twice.id);

    expect(status).toBe(409);
  });

  test('hides the entries of other members', async () => {
    const hidden = await movie('Listed Dune');
    const entry = await add(ben, hidden.id);

    const { status } = await request(
      app,
      'GET',
      `/watchlist/${entry.body.id}`,
      {
        auth: ana
      }
    );

    expect(status).toBe(404);
  });

  test('requires an account', async () => {
    const { status } = await request(app, 'POST', '/watchlist/query', {
      payload: {}
    });

    expect(status).toBe(401);
  });
});
