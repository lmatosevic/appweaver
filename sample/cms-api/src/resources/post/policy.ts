import { currentRequestScope } from '@appweaver/core';
import { createPolicy, hasRole } from '@appweaver/data';

const READ_ACTIONS = ['find', 'query', 'aggregate', 'export'];

export default createPolicy({
  modelName: 'Post',
  // The public routes serve the published posts only. A signed-in user also
  // reads their own drafts and edits only their own posts, an admin every post.
  // The code of the application calls the service without a user outside of a
  // request (the jobs, the seeders, the tests), so it is not restricted
  readRestrictions: (user, _resource, action) => {
    if (!user) {
      return currentRequestScope()?.source === 'http'
        ? { status: 'Published' }
        : null;
    }
    if (hasRole(user, 'Admin')) {
      return null;
    }
    return READ_ACTIONS.includes(action)
      ? { OR: [{ status: 'Published' }, { authorId: user.id }] }
      : { authorId: user.id };
  },
  // The author relation is not part of the create input
  writeRestrictions: (user, _resource, action) =>
    user && action === 'create' ? { author: user.id } : null,
  // Rendered on the public site
  files: {
    coverImage: {
      accessType: 'public'
    },
    galleryImages: {
      accessType: 'public'
    }
  }
});
