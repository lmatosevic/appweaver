import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Tag',
  scalars: {
    name: {
      type: 'string',
      unique: true,
      maxLength: 64,
      example: 'Nature'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      maxLength: 64,
      example: 'nature'
    }
  },
  relations: {
    posts: {
      model: 'Post',
      type: 'manyToMany',
      mappedBy: 'tags',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    }
  }
});
