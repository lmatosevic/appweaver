import { ResourcePolicy } from '@appweaver/common';

export default {
  name: 'Post', // optional (default: folder path from path.join(cwd, ../),
  checkAccess: (action, resource) => true,
  readRestrictions: (action, resource) => null,
  writeRestrictions: (action, resource) => null,
  files: {
    coverImage: {
      accessType: 'protected', // 'protected' | 'private' | 'public';
      canAccess: (user, resource, file) => true,
      canCreate: (user, resource, file) => true,
      canDelete: (user, resource, file) => true
    },
    galleryImages: {
      accessType: 'public'
    }
  }
} satisfies ResourcePolicy;
