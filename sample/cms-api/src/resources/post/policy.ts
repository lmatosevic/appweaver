import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Post',
  checkAccess: (user, resource, action) => true,
  readRestrictions: (user, resource, action) => null,
  writeRestrictions: (user, resource, action) => null,
  files: {
    coverImage: {
      accessType: 'protected',
      canAccess: (user, resource, file) => true,
      canCreate: (user, resource, file) => true,
      canDelete: (user, resource, file) => true
    },
    galleryImages: {
      accessType: 'public'
    }
  }
});
