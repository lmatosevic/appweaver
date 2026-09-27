import { CacheService, inject } from '@appweaver/core';
import db from '@db/client';

/**
 * Recomputes the average rating and the review count of the movie, stored on
 * the movie so the catalog sorts and filters by them without a join.
 */
export async function refreshMovieRating(movieId: string): Promise<void> {
  const stats = await db.review.aggregate({
    where: { movieId },
    _avg: { rating: true },
    _count: { _all: true }
  });

  await db.movie.update({
    where: { id: movieId },
    data: {
      rating: Math.round((stats._avg.rating ?? 0) * 10) / 10,
      ratingCount: stats._count._all
    }
  });

  // Written past the movie service, so its cached listings are dropped here
  await inject(CacheService).invalidateCache('Movie', 'update');
}
