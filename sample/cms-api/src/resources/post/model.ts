import { createModel } from '@appweaver/core';
import { UserSingle } from '@/types';

export default createModel({
  name: 'Post',
  scalars: {
    uid: {
      type: 'string',
      unique: true,
      defaultGenerator: 'uuid(7)',
      example: '01a029ee-814e-77ec-bc66-ff36c9966a64'
    },
    title: {
      type: 'string',
      minLength: 3,
      maxLength: 255,
      example: 'Ten trails worth the walk'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      maxLength: 255,
      example: 'ten-trails-worth-the-walk'
    },
    excerpt: {
      type: 'string',
      required: false,
      maxLength: 511
    },
    content: {
      type: 'string',
      required: false,
      maxLength: 65535
    },
    status: {
      type: 'enum',
      values: ['Draft', 'Published', 'Archived'],
      default: 'Draft',
      required: false
    },
    // A future date schedules the draft for the publisher job
    publishedAt: {
      type: 'dateTime',
      required: false
    },
    featured: {
      type: 'boolean',
      default: false
    },
    viewCount: {
      type: 'int',
      default: 0,
      minimum: 0
    },
    seo: {
      type: 'json',
      required: false
    }
  },
  relations: {
    author: {
      model: 'User',
      type: 'oneToMany',
      mappedBy: 'posts',
      owner: true,
      required: false,
      onDelete: 'setNull',
      input: {
        type: 'none'
      }
    },
    // The included parent gives the full breadcrumb: Travel > Trail guides
    category: {
      model: 'Category',
      type: 'oneToMany',
      mappedBy: 'posts',
      owner: true,
      required: false,
      onDelete: 'setNull',
      output: {
        type: 'always',
        include: {
          parent: {
            type: 'always'
          }
        }
      }
    },
    // Matched by slug, so an existing tag is reused instead of duplicated
    tags: {
      model: 'Tag',
      type: 'manyToMany',
      mappedBy: 'posts',
      required: false,
      input: {
        type: 'all',
        uniqueKey: 'slug',
        allowCreate: true,
        allowUpdate: true
      }
    },
    comments: {
      model: 'Comment',
      type: 'oneToMany',
      mappedBy: 'post',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single',
        count: true
      }
    },
    pinnedComment: {
      model: 'Comment',
      type: 'oneToOne',
      mappedBy: 'pinnedIn',
      owner: true,
      required: false,
      onDelete: 'setNull',
      output: {
        type: 'single'
      }
    }
  },
  files: {
    coverImage: {
      mimeType: 'image/(jpeg|png|webp)',
      namePattern: 'covers/{name}-{hash}.{extension}',
      maxSize: '5 MB',
      image: {
        quality: 80,
        maxWidth: 1920
      }
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
    omit: ['uid', 'viewCount']
  },
  update: {
    omit: ['uid', 'viewCount']
  },
  export: {
    title: {
      headerName: 'Title'
    },
    excerpt: {
      exclude: true
    },
    content: {
      exclude: true
    },
    seo: {
      exclude: true
    },
    publishedAt: {
      headerName: 'Published',
      mapValue: (value: Date) =>
        value ? new Date(value).toISOString().slice(0, 10) : ''
    },
    category: {
      headerName: 'Category',
      mapValue: 'name'
    },
    tags: {
      headerName: 'Tags',
      mapValue: 'name'
    },
    coverImage: {
      headerName: 'Cover Image',
      mapValue: 'originalName'
    },
    galleryImages: {
      headerName: 'Gallery',
      mapValue: 'originalName'
    },
    // One column, rather than one per field of the related user
    author: {
      headerName: 'Author',
      mapValue: (user: UserSingle | null) =>
        user ? user.displayName || `${user.firstName} ${user.lastName}` : ''
    }
  },
  index: [
    ['status', '-publishedAt'],
    ['categoryId', '-publishedAt'],
    ['-createdAt', '+id']
  ]
});
