import { createService, currentAuthUser, HttpError } from '@appweaver/core';
import db from '@db/client';
import { WatchlistEntryCreate, WatchlistEntryUpdate } from '@/types';
import { relationId } from '@/features/catalog/relation-id';

export default createService({
  modelName: 'WatchlistEntry',
  beforeCreate: async (data: WatchlistEntryCreate) => {
    const user = currentAuthUser();
    if (!user) {
      return;
    }

    const existing = await db.watchlistEntry.findFirst({
      where: { movieId: relationId(data.movie), userId: Number(user.id) },
      select: { id: true }
    });
    if (existing) {
      throw new HttpError('The movie is already on the watchlist', 409);
    }
  },
  beforeUpdate: (_, data: WatchlistEntryUpdate) => {
    if (data.status === 'Watched' && !data.watchedAt) {
      data.watchedAt = new Date();
    }
  }
});
