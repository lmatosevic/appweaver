import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Post',
  checkAccess: (action, resource) => true,
  readRestrictions: (action, resource) => null,
  writeRestrictions: (action, resource) => null,
  files: {
    coverImage: {
      accessType: 'protected',
      canAccess: (identity, resource, file) => true,
      canCreate: (identity, resource, file) => true,
      canDelete: (identity, resource, file) => true
    },
    galleryImages: {
      accessType: 'public'
    }
  }
});
