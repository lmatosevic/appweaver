import { createRoutes } from '@appweaver/core';

// Private to each member, the policy scopes every action to the own list
export default createRoutes({
  modelName: 'WatchlistEntry',
  path: '/watchlist',
  aggregate: {
    exclude: true
  },
  export: {
    exclude: true
  }
});
