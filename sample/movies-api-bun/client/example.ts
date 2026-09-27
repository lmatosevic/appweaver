/**
 * Uses the typed client generated from the OpenAPI document of this API. Start
 * the API first (bun run dev), then run: bun run client:example
 *
 * Regenerate the client after changing a model or a route:
 *   bun run openapi && bun run client:generate
 */
import { ClientError } from '@appweaver/client';
import { createClient } from './generated/movies-client';

const baseUrl = process.env.MOVIES_API_URL ?? 'http://localhost:5005';

// The access token, known once signed in, is read on every request
let accessToken: string | undefined;

const client = createClient({
  baseUrl,
  timeout: 10_000,
  auth: { jwt: async () => accessToken ?? '' }
});

async function main(): Promise<void> {
  // The catalog is public, so these need no account. Filters, sorting, and the
  // response are all typed from the API schema.
  const topRated = await client.movie.query({
    filter: { ratingCount: { _gte: 1 } },
    sort: { rating: 'desc' },
    size: 5
  });
  console.log('Top rated:');
  for (const movie of topRated.items) {
    console.log(`  ${movie.title} (${movie.year}) ${movie.rating}/10`);
  }

  const arrival = (
    await client.movie.query({ filter: { slug: 'arrival-2016' } })
  ).items[0];
  if (!arrival) {
    throw new Error('Seed the database first: bun run seed');
  }

  const details = await client.movie.find(arrival.id);
  console.log(`\n${details.title}, ${details.runtime}:`);
  for (const credit of details.credits ?? []) {
    const character = credit.character ? ` as ${credit.character}` : '';
    console.log(`  ${credit.role}: ${credit.person?.name}${character}`);
  }

  // A custom route of the API, generated as its own method
  const similar = await client.getApiMoviesByIdSimilar({
    params: { path: { id: arrival.id }, query: { limit: 3 } }
  });
  console.log(
    '\nSimilar:',
    similar.items.map((movie) => movie.title).join(', ')
  );

  // Signing in as a demo member unlocks the watchlist
  const tokens = await client.auth.login({
    username: 'nightowl@movies.example.com',
    password: 'Passw0rd!'
  });
  accessToken = tokens.accessToken;

  const me = await client.auth.me();
  console.log(`\nSigned in as ${me.email}`);

  try {
    await client.watchlistEntry.create({ movie: arrival.id });
    console.log(`Added ${arrival.title} to the watchlist`);
  } catch (e) {
    // The API answers with a typed error, i.e. 409 for a movie already listed
    if (e instanceof ClientError) {
      console.log(`Not added (${e.errorCode}): ${e.message}`);
    } else {
      throw e;
    }
  }

  const watchlist = await client.watchlistEntry.query({});
  console.log(
    'Watchlist:',
    watchlist.items
      .map((entry) => `${entry.movie?.title} (${entry.status})`)
      .join(', ')
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
