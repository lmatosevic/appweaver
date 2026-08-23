import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Post',
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
