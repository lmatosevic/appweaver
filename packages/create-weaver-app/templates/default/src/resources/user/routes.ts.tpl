import { createRoutes } from '@appweaver/core';

// Only an admin can change users, since the input includes their roles,
// password, and enabled flag
export default createRoutes({
  modelName: 'User',
  create: {
    roles: ['Admin']
  },
  update: {
    roles: ['Admin']
  },
  delete: {
    roles: ['Admin']
  },
  fileUpload: {
    roles: ['Admin']
  },
  fileDelete: {
    roles: ['Admin']
  }
});
