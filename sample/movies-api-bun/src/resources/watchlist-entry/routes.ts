import { createRoutes } from '@appweaver/web';

// Private to each member, the policy scopes every action to the own list
export default createRoutes({
  modelName: 'WatchlistEntry',
  path: '/watchlist',
  aggregate: {
    exclude: true
  },
  export: {
    exclude: true
  },
  // Keeps the watchlist of a member in sync across their devices. The events
  // need an account, and the read restrictions of the policy deliver each one
  // to the owner of the entry only.
  events: {
    actions: ['create', 'update', 'delete']
  }
});
