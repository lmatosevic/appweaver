import { createAuthModel } from '@appweaver/core';

export default createAuthModel({
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
    },
    phone: {
      type: 'string',
      maxLength: 32
    },
    secret: {
      type: 'string',
      required: false,
      hidden: true
    }
  },
  relations: {
    posts: {
      model: 'Post',
      mappedBy: 'author',
      array: true,
      required: false,
      input: {
        type: 'all',
        fullModel: true
      }
    }
  },
  files: {
    avatar: {
      mimeType: 'image/*',
      namePattern: 'avatars/{name}-{hash}.{extension}',
      maxSize: '3 MB'
    }
  },
  virtual: {
    active: {
      type: 'boolean',
      default: true,
      output: {
        value: () => Math.random() > 0.5
      }
    }
  },
  index: ['email']
});
