import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'WatchlistEntry',
  readRestrictions: (user) => (user ? { userId: user.id } : {}),
  writeRestrictions: (user, _, action) =>
    user && action === 'create' ? { user: user.id } : null
});
