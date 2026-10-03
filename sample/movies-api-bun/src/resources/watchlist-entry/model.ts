import { createModel } from '@appweaver/core';

export default createModel({
  name: 'WatchlistEntry',
  scalars: {
    status: {
      type: 'enum',
      values: ['Planned', 'Watching', 'Watched'],
      default: 'Planned'
    },
    watchedAt: {
      type: 'dateTime',
      required: false
    },
    notes: {
      type: 'string',
      required: false,
      maxLength: 500
    }
  },
  relations: {
    // Set to the signed-in member
    user: {
      model: 'User',
      type: 'manyToOne',
      mappedBy: 'watchlist',
      required: false,
      onDelete: 'cascade',
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    },
    movie: {
      model: 'Movie',
      type: 'manyToOne',
      mappedBy: 'watchlistEntries',
      onDelete: 'cascade',
      output: {
        type: 'always'
      }
    }
  },
  update: {
    omit: ['movie']
  },
  unique: [['userId', 'movieId']]
});
