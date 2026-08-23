import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Comment',
  id: {
    generator: 'cuid(2)'
  },
  scalars: {
    body: {
      type: 'string',
      minLength: 2,
      maxLength: 4095,
      example: 'Great read, thanks!'
    },
    // Signed-in readers are attributed through createdById instead
    guestName: {
      type: 'string',
      required: false,
      maxLength: 255
    },
    guestEmail: {
      type: 'string',
      required: false,
      format: 'email',
      maxLength: 255,
      example: 'reader@example.com'
    },
    status: {
      type: 'enum',
      values: ['Pending', 'Approved', 'Spam'],
      default: 'Pending',
      required: false
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
      input: {
        type: 'none'
      },
      output: {
        type: 'single'
      }
    }
  },
  files: {
    attachment: {
      mimeType: 'text/*',
      maxSize: '1 MB'
    }
  },
  create: {
    omit: ['status']
  },
  index: [['status', '-createdAt']]
});
