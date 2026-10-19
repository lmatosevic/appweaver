import { createAuthModel } from '@appweaver/core';

export default createAuthModel({
  name: 'User',
  scalars: {
    firstName: {
      type: 'string',
      maxLength: 255
    },
    lastName: {
      type: 'string',
      maxLength: 255
    },
    email: {
      type: 'string',
      unique: true,
      format: 'email',
      maxLength: 255
    }
  },
  files: {
    avatar: {
      mimeType: 'image/*',
      namePattern: 'avatars/{name}-{hash}.{extension}',
      maxSize: '3 MB'
    }
  }
});
