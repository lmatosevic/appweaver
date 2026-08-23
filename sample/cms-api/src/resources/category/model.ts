import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Category',
  scalars: {
    name: {
      type: 'string',
      maxLength: 128,
      example: 'Technology'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      maxLength: 128,
      example: 'technology'
    },
    description: {
      type: 'string',
      required: false,
      maxLength: 1023
    },
    position: {
      type: 'int',
      default: 0,
      minimum: 0
    }
  },
  relations: {
    // Self-reference building the category tree.
    parent: {
      model: 'Category',
      type: 'oneToMany',
      mappedBy: 'children',
      owner: true,
      required: false,
      onDelete: 'setNull',
      output: {
        type: 'always',
        maxDepth: 3
      }
    },
    children: {
      model: 'Category',
      type: 'oneToMany',
      mappedBy: 'parent',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    posts: {
      model: 'Post',
      type: 'oneToMany',
      mappedBy: 'category',
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
  index: [['parentId', '+position']]
});
