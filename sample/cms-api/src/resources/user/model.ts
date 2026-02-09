import { createModel } from '@appweaver/core';

export default createModel({
  name: 'User',
  id: {
    type: 'int',
    generator: 'autoincrement()'
  },
  audit: {
    updatedAt: true,
    createdAt: true,
    createdById: true
  },
  scalars: {
    firstName: {
      type: 'text',
      maxLength: 255
    },
    lastName: {
      type: 'text',
      maxLength: 255
    },
    email: {
      type: 'text',
      format: 'email',
      maxLength: 255
    },
    phone: {
      type: 'text',
      maxLength: 32
    },
    secret: {
      type: 'text',
      hidden: true
    }
  },
  relations: {
    posts: {
      model: 'Post',
      array: true
    }
  },
  files: {
    avatar: {
      mimeType: 'image/*',
      namePattern: 'avatars/{name}-{hash}.{extension}',
      maxSize: '2 MB'
    }
  },
  virtual: {
    active: {
      type: 'boolean',
      default: true
    }
  },
  index: ['email']
});
