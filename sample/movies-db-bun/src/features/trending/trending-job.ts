import { CacheService, inject } from '@appweaver/core';
import { logger, Scheduler } from '@appweaver/common';
import db from '@db/client';
import { TRENDING_WINDOW_DAYS, trendingScore } from './trending-score';

// Every night, when the catalog is quiet
inject(Scheduler).addJob({
  cronTime: '0 3 * * *',
  timeZone: 'UTC',
  onTick: async () => {
    const updated = await refreshTrendingScores();
    logger.info(`Trending scores refreshed: ${updated}`);
  }
});

/** Scores every movie from its activity within the trending window. */
export async function refreshTrendingScores(
  now: Date = new Date()
): Promise<number> {
  const since = new Date(now.getTime() - TRENDING_WINDOW_DAYS * 86_400_000);

  const [movies, reviews, watchlistAdds] = await Promise.all([
    db.movie.findMany({
      select: { id: true, rating: true, releaseDate: true }
    }),
    db.review.groupBy({
      by: ['movieId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true }
    }),
    db.watchlistEntry.groupBy({
      by: ['movieId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true }
    })
  ]);

  const counts = (groups: { movieId: string; _count: { _all: number } }[]) =>
    new Map(groups.map((group) => [group.movieId, group._count._all]));
  const reviewCounts = counts(reviews);
  const watchlistCounts = counts(watchlistAdds);

  for (const movie of movies) {
    await db.movie.update({
      where: { id: movie.id },
      data: {
        trendingScore: trendingScore(
          {
            recentReviews: reviewCounts.get(movie.id) ?? 0,
            recentWatchlistAdds: watchlistCounts.get(movie.id) ?? 0,
            rating: movie.rating,
            releaseDate: movie.releaseDate
          },
          now
        )
      }
    });
  }

  // Written past the movie service, so its cached listings are dropped here
  await inject(CacheService).invalidateCache('Movie', 'update');

  return movies.length;
}
