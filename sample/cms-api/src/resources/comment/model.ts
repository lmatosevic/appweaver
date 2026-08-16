import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Comment',
  id: {
    type: 'string',
    generator: 'cuid(2)'
  },
  audit: {
    updatedAt: true,
    createdAt: true,
    createdById: true
  },
  scalars: {
    body: {
      type: 'string',
      maxLength: 4095,
      example: 'Great read, thanks!'
    },
    authorName: {
      type: 'string',
      maxLength: 255,
      required: false
    },
    approved: {
      type: 'boolean',
      default: false
    }
  },
  relations: {
    post: {
      model: 'Post',
      type: 'oneToMany',
      mappedBy: 'comments',
      owner: true,
      onDelete: 'cascade',
      output: {
        type: 'single'
      }
    },
    pinnedIn: {
      model: 'Post',
      type: 'oneToOne',
      mappedBy: 'pinnedComment',
      required: false,
      output: {
        type: 'single'
      }
    }
  },
  files: {
    attachment: {
      mimeType: 'text/*',
      maxSize: '1 MB',
      onResourceDeleted: 'delete'
    }
  },
  index: ['approved']
});
