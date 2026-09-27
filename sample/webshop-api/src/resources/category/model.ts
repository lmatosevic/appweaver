import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Category',
  scalars: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      example: 'Headphones'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      example: 'headphones'
    },
    description: {
      type: 'string',
      required: false,
      maxLength: 2000
    },
    position: {
      type: 'int',
      default: 0,
      minimum: 0
    }
  },
  relations: {
    products: {
      model: 'Product',
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
  index: ['+position']
});
