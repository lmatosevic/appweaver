import { createModel } from '@appweaver/core';

/** An order line, keeping the name and price the product had at checkout. */
export default createModel({
  name: 'OrderItem',
  scalars: {
    productName: {
      type: 'string',
      maxLength: 200
    },
    sku: {
      type: 'string',
      maxLength: 32
    },
    // In cents
    unitPrice: {
      type: 'int',
      minimum: 0
    },
    quantity: {
      type: 'int',
      minimum: 1,
      maximum: 99
    },
    lineTotal: {
      type: 'int',
      minimum: 0
    }
  },
  relations: {
    order: {
      model: 'Order',
      type: 'oneToMany',
      mappedBy: 'items',
      owner: true,
      onDelete: 'cascade',
      output: {
        type: 'none'
      }
    },
    // Kept when the product is removed from the catalog
    product: {
      model: 'Product',
      type: 'oneToMany',
      mappedBy: 'orderItems',
      owner: true,
      required: false,
      output: {
        type: 'none'
      }
    }
  }
});
