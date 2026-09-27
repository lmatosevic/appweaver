import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Review',
  scalars: {
    rating: {
      type: 'int',
      minimum: 1,
      maximum: 5,
      example: 5
    },
    title: {
      type: 'string',
      required: false,
      maxLength: 150
    },
    body: {
      type: 'string',
      required: false,
      maxLength: 5000
    },
    // The author bought the product, checked by the service
    verifiedPurchase: {
      type: 'boolean',
      default: false
    },
    authorName: {
      type: 'string',
      maxLength: 100,
      example: 'Iva P.'
    }
  },
  relations: {
    product: {
      model: 'Product',
      type: 'oneToMany',
      mappedBy: 'reviews',
      owner: true,
      onDelete: 'cascade',
      output: {
        type: 'single'
      }
    },
    // Set to the signed-in customer, never exposed on the public reviews
    author: {
      model: 'User',
      type: 'oneToMany',
      mappedBy: 'reviews',
      owner: true,
      required: false,
      onDelete: 'cascade',
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  },
  create: {
    omit: ['verifiedPurchase', 'authorName']
  },
  update: {
    omit: ['verifiedPurchase', 'authorName', 'product']
  },
  unique: [['productId', 'authorId']]
});
