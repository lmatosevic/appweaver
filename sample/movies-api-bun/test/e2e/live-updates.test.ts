import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Application, injectService, runAs } from '@appweaver/core';
import {
  createClient,
  MoviesClient
} from '../../client/generated/movies-client';
import { testApp, testAppUrl } from './support/app';
import {
  account,
  createRoles,
  movie,
  request,
  signIn
} from './support/fixtures';

/**
 * The realtime connections of the generated client: the live chat of a movie
 * page, the public feed of the new reviews, and the private watchlist events.
 * The clients connect to the shared application listening on a random port.
 */
describe('Live updates', () => {
  let app: Application;
  let baseUrl: string;
  let users: Record<string, any>;
  let as: Record<string, Record<string, string>>;
  const clients: MoviesClient[] = [];

  // A visitor over SSE without an account, a member over a WebSocket
  const visitor = () =>
    track(
      createClient({ baseUrl, realtime: { transport: 'sse', anonymous: true } })
    );
  const member = (auth: Record<string, string>) =>
    track(
      createClient({
        baseUrl,
        auth: { jwt: auth.authorization.replace('Bearer ', '') },
        realtime: { transport: 'websocket' }
      })
    );
  const track = (client: MoviesClient) => {
    clients.push(client);
    return client;
  };

  beforeAll(async () => {
    app = await testApp();
    await createRoles();
    baseUrl = await testAppUrl();

    users = { ana: await account('Lena'), ben: await account('Leo') };
    as = {
      ana: await signIn(app, users.ana),
      ben: await signIn(app, users.ben)
    };
  }, 30_000);

  afterAll(() => {
    for (const client of clients) {
      client.realtime.disconnect();
    }
  });

  test('delivers the chat of a movie to its visitors only', async () => {
    const watched = await movie('Live Arrival');
    const other = await movie('Live Contact');
    const messages: string[] = [];
    const elsewhere: string[] = [];
    const typing: string[] = [];

    const page = visitor();
    await Promise.all([
      page.realtime.subscribe(
        'movie.chat',
        ({ authorName, text }) => messages.push(`${authorName}: ${text}`),
        { movieId: watched.id }
      ).ready,
      page.realtime.subscribe(
        'movie.typing',
        ({ authorName }) => typing.push(authorName),
        { movieId: watched.id }
      ).ready,
      page.realtime.subscribe(
        'movie.chat',
        ({ text }) => elsewhere.push(text),
        { movieId: other.id }
      ).ready
    ]);

    const lena = member(as.ana);
    lena.realtime.emit('chat.typing', { movieId: watched.id });
    const sent = await lena.realtime.send('chat.send', {
      movieId: watched.id,
      text: '  Heptapods!  '
    });

    await until(() => messages.length > 0 && typing.length > 0);
    expect(sent.messageId).toBeString();
    expect(new Date(sent.sentAt).getTime()).not.toBeNaN();
    expect(messages).toEqual(['Lena: Heptapods!']);
    expect(typing).toEqual(['Lena']);
    expect(elsewhere).toEqual([]);
  });

  test('requires an account to chat', async () => {
    const watched = await movie('Live Gravity');

    const { status, body } = await request(
      app,
      'POST',
      '/realtime/actions/chat.send',
      { payload: { movieId: watched.id, text: 'Hello' } }
    );

    expect(status).toBe(403);
    expect(body.code).toBe('REALTIME_ACTION_DENIED');
  });

  test('answers a message to an unknown movie with an error', async () => {
    const lena = member(as.ana);

    const error = await lena.realtime
      .send('chat.send', { movieId: 'no-such-movie', text: 'Anyone?' })
      .catch((e) => e);

    expect(error.code).toBe('RESOURCE_NOT_FOUND');
  });

  test('rejects an empty message', async () => {
    const watched = await movie('Live Solaris');
    const lena = member(as.ana);

    const error = await lena.realtime
      .send('chat.send', { movieId: watched.id, text: '   ' })
      .catch((e) => e);

    expect(error.code).toBe('REALTIME_PAYLOAD_INVALID');
  });

  test('feeds the new reviews matching the filter to anyone', async () => {
    const reviewed = await movie('Live Moon');
    const feed: any[] = [];

    const page = visitor();
    await page.realtime.on('Review', ({ current }) => feed.push(current), {
      action: 'create',
      filter: { rating: { _gte: 8 } }
    }).ready;

    // Written through the service as the members, since the review route
    // limits the requests of an IP the other test files share
    const review = (user: any, rating: number, title: string) =>
      runAs(user, () =>
        injectService('Review').create({ movie: reviewed.id, rating, title })
      );
    await review(users.ben, 4, 'Too slow');
    await review(users.ana, 9, 'Sam Rockwell!');

    await until(() => feed.length > 0);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      rating: 9,
      authorName: 'Lena',
      movie: { title: 'Live Moon' }
    });
    // The author stays private, like over HTTP
    expect(feed[0]).not.toHaveProperty('author');
    expect(feed[0]).not.toHaveProperty('authorId');
  });

  test('pushes a watchlist change to its owner only', async () => {
    const listed = await movie('Live Sunshine');
    const lenas: string[] = [];
    const leos: string[] = [];

    await Promise.all([
      member(as.ana).realtime.on('WatchlistEntry', ({ action, current }) =>
        lenas.push(`${action} ${current.movie?.title} ${current.status}`)
      ).ready,
      member(as.ben).realtime.on('WatchlistEntry', ({ action }) =>
        leos.push(action)
      ).ready
    ]);

    const { body: entry } = await request(app, 'POST', '/watchlist', {
      auth: as.ana,
      payload: { movie: listed.id }
    });
    await request(app, 'PATCH', `/watchlist/${entry.id}`, {
      auth: as.ana,
      payload: { status: 'Watched' }
    });
    await request(app, 'DELETE', `/watchlist/${entry.id}`, { auth: as.ana });

    await until(() => lenas.length === 3);
    // Leaves the events of the other member the time to arrive, if they did
    await Bun.sleep(200);
    expect(lenas).toEqual([
      'create Live Sunshine Planned',
      'update Live Sunshine Watched',
      'delete Live Sunshine Watched'
    ]);
    expect(leos).toEqual([]);
  });

  test('keeps the watchlist events from the visitors', async () => {
    const page = visitor();

    const error = await page.realtime
      .on('WatchlistEntry', () => undefined)
      .ready.catch((e) => e);

    expect(error.code).toBe('REALTIME_SUBSCRIPTION_DENIED');
  });
});

/** Waits for the condition, failing after the timeout. */
async function until(condition: () => boolean, timeout = 3000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the realtime events');
    }
    await Bun.sleep(20);
  }
}
