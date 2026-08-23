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
      maxLength: 255,
      example: 'user@example.com'
    },
    phone: {
      type: 'string',
      required: false,
      maxLength: 32,
      example: '+385991234567'
    },
    displayName: {
      type: 'string',
      required: false,
      maxLength: 255,
      example: 'Ana A.'
    },
    bio: {
      type: 'string',
      required: false,
      maxLength: 1023
    },
    website: {
      type: 'string',
      required: false,
      format: 'uri',
      maxLength: 255,
      example: 'https://example.com'
    },
    internalNotes: {
      type: 'string',
      required: false,
      maxLength: 1023,
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
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    pages: {
      model: 'Page',
      type: 'oneToMany',
      mappedBy: 'author',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
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
    byline: {
      type: 'string',
      example: 'Ana Anic',
      input: {
        type: 'none'
      },
      output: {
        value: (user: {
          displayName?: string;
          firstName: string;
          lastName: string;
        }) => user.displayName || `${user.firstName} ${user.lastName}`
      }
    }
  }
});
