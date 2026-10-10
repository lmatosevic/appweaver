import { ApplicationError } from '@appweaver/common';
import { createService, currentAuthUser } from '@appweaver/core';
import db from '@db/client';
import { relationId } from '@/features/catalog/relation-id';
import { MovieErrors } from '@/errors';

export default createService({
  modelName: 'WatchlistEntry',
  beforeCreate: async (data) => {
    const user = currentAuthUser();
    if (!user) {
      return;
    }

    const existing = await db.watchlistEntry.findFirst({
      where: { movieId: relationId(data.movie), userId: Number(user.id) },
      select: { id: true }
    });
    if (existing) {
      throw new ApplicationError(
        MovieErrors.AlreadyOnWatchlist,
        'The movie is already on the watchlist',
        { watchlistEntryId: existing.id }
      );
    }
  },
  beforeUpdate: (_, data) => {
    if (data.status === 'Watched' && !data.watchedAt) {
      data.watchedAt = new Date();
    }
  }
});
