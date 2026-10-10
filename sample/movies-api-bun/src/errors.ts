import { defineErrors } from '@appweaver/core';

/** The error codes of the movies API, returned as the `code` of its error responses. */
export const MovieErrors = defineErrors({
  AlreadyReviewed: { status: 409, title: 'Movie already reviewed' },
  AlreadyOnWatchlist: { status: 409, title: 'Movie already on the watchlist' }
});
