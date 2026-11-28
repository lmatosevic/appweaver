import { createPolicy, hasRole } from '@appweaver/data';

const READ_ACTIONS = ['find', 'query', 'aggregate', 'export'];

export default createPolicy({
  modelName: 'Post',
  // The public routes serve the published posts only. A signed-in user also
  // reads their own drafts and edits only their own posts, an admin every post.
  // The application's own calls (the jobs, the seeders, the tests) skip the
  // policies, so a null user is always an anonymous request
  readRestrictions: (user, _resource, action) => {
    if (!user) {
      return { status: 'Published' };
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
