import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Post',
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
    title: {
      type: 'text',
      default: 'something',
      values: ['Draft', 'Published', 'Archived'],
      array: false,
      required: true,
      unique: false,
      minLength: 0,
      maxLength: 255,
      format: 'email',
      pattern: 'something.*'
    },
    slug: {
      type: 'text',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    },
    content: {
      type: 'text',
      required: false
    },
    counter: {
      type: 'int',
      minimum: 1,
      maximum: 1023
    }
  },
  relations: {
    author: {
      references: {
        model: 'User',
        owner: true
      },
      includes: {
        user: {
          input: {
            type: 'none'
          },
          required: true
        }
      },
      input: {
        type: 'all',
        uniqueKey: 'tag',
        additionalProps: [
          {
            name: 'value',
            required: true
          }
        ]
      },
      output: {
        type: 'always',
        count: true
      },
      minItems: 1,
      required: false,
      createIfNotExists: false,
      orphanRemoval: true
    }
  },
  files: {
    coverImage: {
      mimeType: 'image/(jpg|png|gif)',
      namePattern: 'covers/{name}-{hash}.{extension}'
    },
    galleryImages: {
      output: {
        type: 'single',
        count: true
      },
      array: true,
      mimeType: 'image/*',
      maxSize: '5 MB',
      maxCount: 10
    }
  },
  create: {
    omit: ['counter']
  },
  update: {
    pick: ['title', 'content']
  },
  virtual: {
    randomNumbers: {
      type: 'float',
      array: true,
      required: true,
      input: {
        type: 'none'
      },
      output: {
        type: 'always',
        value: 321
      }
    }
  },
  export: {
    title: {
      headerName: 'My Title',
      exclude: false,
      mapValue: 'title'
    },
    content: {
      exclude: true
    },
    comments: {
      mapValue: 'username'
    }
  },
  index: ['slug']
});
