import { describe, expect, test } from 'bun:test';
import { trendingScore } from '@/features/trending/trending-score';

const now = new Date('2026-09-27T00:00:00.000Z');

describe('trendingScore', () => {
  test('weighs a review above a watchlist addition', () => {
    const reviewed = trendingScore(
      { recentReviews: 1, recentWatchlistAdds: 0, rating: 0 },
      now
    );
    const listed = trendingScore(
      { recentReviews: 0, recentWatchlistAdds: 1, rating: 0 },
      now
    );

    expect(reviewed).toBe(3);
    expect(listed).toBe(2);
  });

  test('breaks a tie of activity by the rating', () => {
    const signals = { recentReviews: 2, recentWatchlistAdds: 1 };

    expect(trendingScore({ ...signals, rating: 9 }, now)).toBeGreaterThan(
      trendingScore({ ...signals, rating: 6 }, now)
    );
  });

  test('halves the score of a release every two years', () => {
    const signals = { recentReviews: 2, recentWatchlistAdds: 0, rating: 8 };

    const fresh = trendingScore({ ...signals, releaseDate: now }, now);
    const older = trendingScore(
      { ...signals, releaseDate: new Date('2024-09-27T00:00:00.000Z') },
      now
    );

    expect(fresh).toBe(10);
    expect(older).toBeCloseTo(5, 1);
  });

  test('does not boost an unreleased movie', () => {
    const signals = { recentReviews: 1, recentWatchlistAdds: 0, rating: 0 };

    expect(
      trendingScore(
        { ...signals, releaseDate: new Date('2027-01-01T00:00:00.000Z') },
        now
      )
    ).toBe(trendingScore(signals, now));
  });

  test('scores a movie without activity by its rating alone', () => {
    expect(
      trendingScore(
        { recentReviews: 0, recentWatchlistAdds: 0, rating: 7 },
        now
      )
    ).toBe(3.5);
  });
});
