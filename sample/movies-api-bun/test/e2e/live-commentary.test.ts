import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  createClient,
  MoviesClient
} from '../../client/generated/movies-client';
import { Role } from '@/features/access/roles';
import { testApp, testAppUrl } from './support/app';
import { account, createRoles, movie, signIn } from './support/fixtures';

type Note = { at: number; text: string };

/**
 * The live commentary of a curator: an input the curator streams to an
 * action, passed on to every viewer of the movie through a stream, over the
 * shared application listening on a random port.
 */
describe('Live commentary', () => {
  let baseUrl: string;
  let as: Record<string, Record<string, string>>;
  const clients: MoviesClient[] = [];

  // A visitor over SSE without an account, a user over a WebSocket
  const visitor = () =>
    track(
      createClient({ baseUrl, realtime: { transport: 'sse', anonymous: true } })
    );
  const signedIn = (auth: Record<string, string>) =>
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

  /** Follows the commentary of a movie, collecting its notes and its end. */
  const follow = async (client: MoviesClient, movieId: string) => {
    const viewer = { notes: [] as string[], ended: undefined as unknown };
    await client.realtime.stream(
      'movie.commentary',
      {
        onChunk: ({ at, text }: Note) => viewer.notes.push(`${at} ${text}`),
        onEnd: (result) => (viewer.ended = result)
      },
      { key: movieId }
    ).ready;
    return viewer;
  };

  beforeAll(async () => {
    const app = await testApp();
    await createRoles();
    baseUrl = await testAppUrl();

    as = {
      curator: await signIn(app, await account('Nora', Role.Curator)),
      member: await signIn(app, await account('Otto'))
    };
  }, 30_000);

  afterAll(() => {
    for (const client of clients) {
      client.realtime.disconnect();
    }
  });

  test('passes the notes of the curator on to every viewer', async () => {
    const watched = await movie('Commentary Arrival');
    const other = await movie('Commentary Contact');
    const [anonymous, member, elsewhere] = await Promise.all([
      follow(visitor(), watched.id),
      follow(signedIn(as.member), watched.id),
      follow(visitor(), other.id)
    ]);

    const call = signedIn(as.curator).realtime.call('commentary.broadcast', {
      movieId: watched.id
    });
    await call.input.write({ at: 95, text: 'A single take' });
    await call.input.write({ at: 1420, text: 'No direction, nor tense' });
    call.input.end();

    expect(await call.result).toEqual({ notes: 2 });
    await until(() => !!anonymous.ended && !!member.ended);
    for (const viewer of [anonymous, member]) {
      expect(viewer.notes).toEqual([
        '95 A single take',
        '1420 No direction, nor tense'
      ]);
      expect(viewer.ended).toEqual({ notes: 2 });
    }
    expect(elsewhere.notes).toEqual([]);
  });

  test('replays the notes already given to a late viewer', async () => {
    const watched = await movie('Commentary Moon');
    const early = await follow(visitor(), watched.id);

    const call = signedIn(as.curator).realtime.call('commentary.broadcast', {
      movieId: watched.id
    });
    await call.input.write({ at: 60, text: 'GERTY' });
    await call.input.write({ at: 120, text: 'The base' });
    // Once an early viewer has them, the notes are given
    await until(() => early.notes.length === 2);

    const late = await follow(visitor(), watched.id);
    await call.input.write({ at: 180, text: 'The clone' });
    call.input.end();

    await call.result;
    await until(() => !!late.ended);
    expect(late.notes).toEqual(['60 GERTY', '120 The base', '180 The clone']);
  });

  test('lets the curators broadcast only', async () => {
    const watched = await movie('Commentary Gravity');

    const error = await signedIn(as.member)
      .realtime.call(
        'commentary.broadcast',
        { movieId: watched.id },
        { input: notes([{ at: 1, text: 'Hello' }]) }
      )
      .result.catch((e) => e);

    expect(error.code).toBe('REALTIME_ACTION_DENIED');
  });

  test('refuses the commentary of an unknown movie', async () => {
    const subscribed = await follow(visitor(), 'no-such-movie').catch((e) => e);
    const broadcast = await signedIn(as.curator)
      .realtime.call(
        'commentary.broadcast',
        { movieId: 'no-such-movie' },
        { input: notes([{ at: 1, text: 'Hello' }]) }
      )
      .result.catch((e) => e);

    expect(subscribed.code).toBe('REALTIME_SUBSCRIPTION_DENIED');
    expect(broadcast.code).toBe('RESOURCE_NOT_FOUND');
  });
});

/** The notes as an input, given at once. */
async function* notes(values: Note[]): AsyncIterable<Note> {
  yield* values;
}

/** Waits for the condition, failing after the timeout. */
async function until(condition: () => boolean, timeout = 3000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the commentary');
    }
    await Bun.sleep(20);
  }
}
