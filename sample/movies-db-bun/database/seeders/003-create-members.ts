import { hashPassword } from '@appweaver/core';
import { db } from '@db/client';
import { Role } from '@/features/access/roles';
import { refreshMovieRating } from '@/features/ratings/movie-rating';
import { refreshTrendingScores } from '@/features/trending/trending-job';

/** Every demo member signs in with this password. */
const DEMO_PASSWORD = 'Passw0rd!';

const members = ['cinephile42', 'nightowl', 'popcorn_critic'];

// [member, movie slug, rating, title, contains spoilers]
const reviews: [string, string, number, string, boolean?][] = [
  ['cinephile42', 'arrival-2016', 9, 'Language as a first contact'],
  ['nightowl', 'arrival-2016', 8, 'Quiet and devastating'],
  ['popcorn_critic', 'arrival-2016', 7, 'Slow, but the ending pays off', true],
  ['cinephile42', 'dune-part-two-2024', 9, 'Worth the wait'],
  ['popcorn_critic', 'dune-part-two-2024', 10, 'Pure spectacle'],
  ['nightowl', 'blade-runner-2049', 9, 'Every frame a painting'],
  ['cinephile42', 'parasite-2019', 10, 'Genre-bending perfection'],
  ['nightowl', 'parasite-2019', 9, 'That staircase'],
  ['popcorn_critic', 'inception-2010', 8, 'Still spinning'],
  ['cinephile42', 'spirited-away-2001', 10, 'A timeless fable'],
  ['popcorn_critic', 'mad-max-fury-road-2015', 9, 'Two hours of chase'],
  ['nightowl', 'the-grand-budapest-hotel-2014', 8, 'Charming to the last frame']
];

// [member, movie slug, status]
const watchlist: [string, string, 'Planned' | 'Watching' | 'Watched'][] = [
  ['cinephile42', 'interstellar-2014', 'Planned'],
  ['cinephile42', 'dune-2021', 'Watched'],
  ['nightowl', 'dune-part-two-2024', 'Planned'],
  ['popcorn_critic', 'spirited-away-2001', 'Planned']
];

/**
 * Three members with their reviews and watchlists, after which the ratings
 * and the trending scores of the movies are computed.
 */
export async function createMembers(): Promise<string> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const userIds = new Map<string, number>();
  for (const displayName of members) {
    const user = await db.user.create({
      data: {
        displayName,
        email: `${displayName.replace(/_/g, '.')}@movies.example.com`,
        passwordHash,
        verifiedEmail: true,
        roles: { connect: [{ name: Role.Member }] }
      }
    });
    userIds.set(displayName, user.id);
  }

  const movies = await db.movie.findMany({ select: { id: true, slug: true } });
  const movieIds = new Map(movies.map((movie) => [movie.slug, movie.id]));

  for (const [member, slug, rating, title, containsSpoilers] of reviews) {
    await db.review.create({
      data: {
        movieId: movieIds.get(slug)!,
        authorId: userIds.get(member),
        authorName: member,
        rating,
        title,
        containsSpoilers: containsSpoilers ?? false
      }
    });
  }

  for (const [member, slug, status] of watchlist) {
    await db.watchlistEntry.create({
      data: {
        userId: userIds.get(member),
        movieId: movieIds.get(slug)!,
        status,
        watchedAt: status === 'Watched' ? new Date() : undefined
      }
    });
  }

  for (const movie of movies) {
    await refreshMovieRating(movie.id);
  }
  await refreshTrendingScores();

  return `Seeded ${members.length} members, their password is ${DEMO_PASSWORD}`;
}
