/**
 * A curator gives a live commentary of a movie: the notes stream from the
 * curator to the server over a WebSocket, and from the server to every viewer
 * of the movie page, a visitor over Server-Sent Events and a member over a
 * WebSocket. A viewer opening the page late reads the notes already given.
 * Start the API first (bun run dev), then run: bun run client:commentary
 */
import { createClient, MoviesClient } from './generated/movies-client';

const baseUrl = process.env.MOVIES_API_URL ?? 'http://localhost:5005';

// The notes of the curator, at their moment of the movie in seconds
const notes = [
  { at: 95, text: 'Watch the shell hovering over the meadow, a single take' },
  { at: 1420, text: 'The heptapod writing has no direction, nor tense' },
  { at: 3310, text: 'The score reuses its opening theme, now as a memory' },
  { at: 6200, text: 'The last line reframes the whole film' }
];

async function main(): Promise<void> {
  const curator = await signedIn('curator@movies.example.com');
  const arrival = (
    await curator.movie.query({ filter: { slug: 'arrival-2016' } })
  ).items[0];
  if (!arrival) {
    throw new Error('Seed the database first: bun run seed');
  }

  // Two viewers on the page of the movie. The key of the stream is the ID of
  // the movie, and the policy of the movie decides who may subscribe.
  const visitor = createClient({
    baseUrl,
    realtime: { transport: 'sse', anonymous: true }
  });
  const member = await signedIn('nightowl@movies.example.com');
  await Promise.all([
    follow(visitor, 'visitor', arrival.id),
    follow(member, 'member', arrival.id)
  ]);

  // The curator streams the notes as they are written, here from a
  // generator. The call answers once the input ends.
  let late: MoviesClient | undefined;
  const commentary = curator.realtime.call(
    'commentary.broadcast',
    { movieId: arrival.id },
    {
      input: (async function* () {
        for (const [i, note] of notes.entries()) {
          yield note;
          await Bun.sleep(300);
          if (i === 1) {
            // A viewer opens the page halfway, and catches up
            late = createClient({
              baseUrl,
              realtime: { transport: 'sse', anonymous: true }
            });
            await follow(late, 'late visitor', arrival.id);
          }
        }
      })()
    }
  );
  const { notes: sent } = await commentary.result;
  console.log(`[curator] Commentary of ${arrival.title} ended, ${sent} notes`);

  // Leaves the end a moment to arrive before closing the connections
  await Bun.sleep(300);
  for (const client of [curator, visitor, member, late]) {
    client?.realtime.disconnect();
  }
}

/** Follows the commentary of the movie, printing its notes. */
function follow(
  client: MoviesClient,
  viewer: string,
  movieId: string
): Promise<void> {
  return client.realtime.stream(
    'movie.commentary',
    {
      onStart: () => console.log(`[${viewer}] The commentary starts`),
      onChunk: ({ at, text }) =>
        console.log(`[${viewer}] ${timecode(at)} ${text}`),
      onEnd: () => console.log(`[${viewer}] The commentary ended`),
      onError: (error) =>
        console.log(`[${viewer}] Interrupted: ${error.message}`)
    },
    { key: movieId }
  ).ready;
}

/** A client signed in as the demo account. */
async function signedIn(username: string): Promise<MoviesClient> {
  let accessToken = '';
  const client = createClient({
    baseUrl,
    auth: { jwt: async () => accessToken },
    realtime: { transport: 'websocket' }
  });
  ({ accessToken } = await client.auth.login({
    username,
    password: 'Passw0rd!'
  }));
  return client;
}

/** The moment of the movie as `h:mm:ss`. */
function timecode(seconds: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
