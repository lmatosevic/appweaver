export type TrendingSignals = {
  /** Reviews written within the trending window */
  recentReviews: number;
  /** Watchlist additions within the trending window */
  recentWatchlistAdds: number;
  /** Average rating, 0 to 10 */
  rating: number;
  releaseDate?: Date | null;
};

/** Days of activity counted as recent. */
export const TRENDING_WINDOW_DAYS = 30;

/**
 * Scores how much a movie is talked about right now: recent activity weighs
 * the most, the rating breaks ties, and older releases fade out, halving
 * their score every two years.
 */
export function trendingScore(
  signals: TrendingSignals,
  now: Date = new Date()
): number {
  const activity = signals.recentReviews * 3 + signals.recentWatchlistAdds * 2;
  const quality = signals.rating / 2;

  const ageYears = signals.releaseDate
    ? Math.max(
        (now.getTime() - signals.releaseDate.getTime()) / (365.25 * 86_400_000),
        0
      )
    : 0;
  const freshness = Math.pow(0.5, ageYears / 2);

  return Math.round((activity + quality) * freshness * 100) / 100;
}
