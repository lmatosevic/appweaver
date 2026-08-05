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
      maxLength: 255,
      example: 'user@example.com'
    },
    phone: {
      type: 'string',
      maxLength: 32,
      example: '+37534567890'
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
      type: 'oneToMany',
      mappedBy: 'author',
      required: false,
      input: {
        type: 'all',
        create: true,
        update: true
      }
    }
  },
  files: {
    avatar: {
      mimeType: 'image/*',
      namePattern: 'avatars/{name}-{hash}.{extension}',
      maxSize: '3 MB',
      image: {
        quality: 80,
        width: 480,
        height: 480,
        fit: 'cover'
      }
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
