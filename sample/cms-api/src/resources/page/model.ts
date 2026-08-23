import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Page',
  scalars: {
    title: {
      type: 'string',
      maxLength: 255,
      example: 'About us'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      maxLength: 255,
      example: 'about-us'
    },
    content: {
      type: 'string',
      maxLength: 65535,
      example: '<h1>About us</h1>\n<p>We publish stories about nature.</p>'
    },
    status: {
      type: 'enum',
      values: ['Draft', 'Published', 'Archived'],
      default: 'Draft',
      required: false
    },
    publishedAt: {
      type: 'dateTime',
      required: false
    },
    showInMenu: {
      type: 'boolean',
      default: false
    },
    menuPosition: {
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
      mappedBy: 'pages',
      owner: true,
      required: false,
      onDelete: 'setNull',
      input: {
        type: 'none'
      }
    }
  },
  files: {
    heroImage: {
      mimeType: 'image/(jpeg|png|webp)',
      namePattern: 'pages/{name}-{hash}.{extension}',
      maxSize: '5 MB',
      image: {
        quality: 80,
        maxWidth: 1920
      }
    }
  },
  index: [['status', '+menuPosition']]
});
