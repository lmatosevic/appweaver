import { ApplicationError } from '@appweaver/common';
import { createService, currentAuthUser } from '@appweaver/core';
import db from '@db/client';
import { Review, ReviewCreate } from '@/types';
import { refreshMovieRating } from '@/features/ratings/movie-rating';
import { relationId } from '@/features/catalog/relation-id';
import { MovieErrors } from '@/errors';

type ReviewRecord = Review & { movieId?: string };

export default createService({
  modelName: 'Review',
  beforeCreate: async (data: ReviewCreate & { authorName?: string }) => {
    const user = currentAuthUser() as
      | { id: number; displayName?: string }
      | undefined;
    if (!user) {
      return;
    }

    // Answered before the unique constraint would fail the insert
    const existing = await db.review.findFirst({
      where: { movieId: relationId(data.movie), authorId: user.id },
      select: { id: true }
    });
    if (existing) {
      throw new ApplicationError(
        MovieErrors.AlreadyReviewed,
        `The movie is already reviewed, update review ${existing.id} instead`,
        { reviewId: existing.id }
      );
    }

    data.authorName = user.displayName ?? 'Anonymous';
  },
  // The movie keeps its average rating in step with its reviews
  afterCreate: (review: ReviewRecord) => refreshRatingOf(review),
  afterUpdate: (review: ReviewRecord) => refreshRatingOf(review),
  afterDelete: (review: ReviewRecord) => refreshRatingOf(review),
  textSearch: {
    OR: {
      title: {
        contains: '{input}'
      },
      body: {
        contains: '{input}'
      }
    }
  }
});

function refreshRatingOf(review: ReviewRecord): Promise<void> {
  return refreshMovieRating(review.movieId ?? review.movie.id);
}
