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
      type: 'string',
      default: 'something...',
      minLength: 0,
      maxLength: 255
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      examples: ['title-of-post']
    },
    content: {
      type: 'string',
      required: false
    },
    counter: {
      type: 'string',
      minimum: 1,
      maximum: 1023
    },
    status: {
      type: 'enum',
      required: false,
      default: 'Draft',
      values: ['Draft', 'Published', 'Archived']
    },
    lastActivity: {
      type: 'dateTime',
      required: false
    }
  },
  relations: {
    author: {
      model: 'User',
      mappedBy: 'posts',
      owner: true,
      input: {
        type: 'none'
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
      examples: [12.24],
      array: true,
      input: {
        type: 'none'
      },
      output: {
        type: 'always',
        value: [321.23, 432.54]
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
    coverImage: {
      mapValue: 'originalName'
    },
    galleryImages: {
      mapValue: 'originalName'
    },
    author: {
      firstName: {
        headerName: 'Given Name'
      },
      lastName: {
        headerName: 'Family Name'
      }
    }
  },
  index: ['slug']
});
