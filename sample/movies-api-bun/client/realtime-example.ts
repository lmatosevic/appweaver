/**
 * Uses the realtime connections of the typed client on a movie page: a
 * visitor without an account follows the live chat over Server-Sent Events,
 * while a signed-in member chats over a WebSocket and gets the changes of
 * their watchlist pushed. Start the API first (bun run dev), then run:
 * bun run client:realtime
 */
import { createClient, ErrorCode, isApiError } from './generated/movies-client';

const baseUrl = process.env.MOVIES_API_URL ?? 'http://localhost:5005';

// A visitor connects without a ticket, to the public channels only. SSE is
// what a browser `EventSource` speaks, its actions going over HTTP.
const visitor = createClient({
  baseUrl,
  realtime: { transport: 'sse', anonymous: true }
});

// A member connects with a ticket asked for with their access token
let accessToken: string | undefined;
const member = createClient({
  baseUrl,
  auth: { jwt: async () => accessToken ?? '' },
  realtime: { transport: 'websocket' }
});

async function main(): Promise<void> {
  const arrival = (
    await visitor.movie.query({ filter: { slug: 'arrival-2016' } })
  ).items[0];
  if (!arrival) {
    throw new Error('Seed the database first: bun run seed');
  }

  // The visitor opens the page of the movie: its live chat, who is typing,
  // and a ticker of the new spoiler-free reviews rated 8 or more
  const page = [
    visitor.realtime.subscribe(
      'movie.chat',
      ({ authorName, text }) => console.log(`[visitor] ${authorName}: ${text}`),
      { movieId: arrival.id }
    ),
    visitor.realtime.subscribe(
      'movie.typing',
      ({ authorName }) => console.log(`[visitor] ${authorName} is typing...`),
      { movieId: arrival.id }
    ),
    visitor.realtime.on(
      'Review',
      ({ current }) =>
        console.log(
          `[visitor] New review of ${current.movie?.title}: ${current.rating}/10 by ${current.authorName}`
        ),
      {
        action: 'create',
        filter: { rating: { _gte: 8 }, containsSpoilers: false }
      }
    )
  ];
  await Promise.all(page.map((subscription) => subscription.ready));
  console.log(
    `Visitor on the page of ${arrival.title}, over ${visitor.realtime.transport}`
  );

  // The member signs in, and follows their own watchlist. The events of the
  // other members never reach them, the policy of the model sees to it.
  const tokens = await member.auth.login({
    username: 'nightowl@movies.example.com',
    password: 'Passw0rd!'
  });
  accessToken = tokens.accessToken;

  await member.realtime.on('WatchlistEntry', ({ action, current }) =>
    console.log(
      `[member] Watchlist ${action}: ${current.movie?.title} (${current.status})`
    )
  ).ready;
  console.log(`Member connected over ${member.realtime.transport}`);

  // Typing is fire-and-forget, a message waits for its result
  member.realtime.emit('chat.typing', { movieId: arrival.id });
  const sent = await member.realtime.send('chat.send', {
    movieId: arrival.id,
    text: 'Rewatching it tonight, that score still gets me'
  });
  console.log(`[member] Message ${sent.messageId} sent at ${sent.sentAt}`);

  // A failed action answers with the problem details, like a route
  try {
    await member.realtime.send('chat.send', {
      movieId: 'no-such-movie',
      text: 'Anyone here?'
    });
  } catch (e) {
    if (isApiError(e) && e.is(ErrorCode.ResourceNotFound)) {
      console.log(`[member] Not sent: ${e.message}`);
    } else {
      throw e;
    }
  }

  // A change made over HTTP, i.e. on the phone of the member, is pushed to
  // the WebSocket. Each run moves the movie one status further.
  const [entry] = (
    await member.watchlistEntry.query({ filter: { movie: arrival.id } })
  ).items;
  if (!entry) {
    await member.watchlistEntry.create({ movie: arrival.id });
  } else {
    const next: Record<typeof entry.status, typeof entry.status> = {
      Planned: 'Watching',
      Watching: 'Watched',
      Watched: 'Planned'
    };
    await member.watchlistEntry.update({
      id: entry.id,
      status: next[entry.status]
    });
  }

  // Leaves the events a moment to arrive before closing the connections
  await new Promise((resolve) => setTimeout(resolve, 500));
  visitor.realtime.disconnect();
  member.realtime.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
