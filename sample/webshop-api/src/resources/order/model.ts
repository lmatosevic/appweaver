import { createModel } from '@appweaver/core';

/**
 * Placed through the checkout route only, and moved along by the payment
 * worker, the fulfillment partner, and the cancellation.
 */
export default createModel({
  name: 'Order',
  // Hard to guess, as a customer shares it with the support
  id: {
    generator: 'cuid(2)'
  },
  scalars: {
    number: {
      type: 'string',
      unique: true,
      example: 'WS-2026-000042'
    },
    status: {
      type: 'enum',
      values: [
        'Pending',
        'Paid',
        'Shipped',
        'Delivered',
        'Cancelled',
        'PaymentFailed'
      ],
      default: 'Pending'
    },
    // All the amounts are in cents
    subtotal: {
      type: 'int',
      minimum: 0
    },
    discount: {
      type: 'int',
      default: 0,
      minimum: 0
    },
    shippingCost: {
      type: 'int',
      default: 0,
      minimum: 0
    },
    total: {
      type: 'int',
      minimum: 0
    },
    // A copy of the address, which the customer may later change or delete
    shippingAddress: {
      type: 'json'
    },
    paidAt: {
      type: 'dateTime',
      required: false
    },
    shippedAt: {
      type: 'dateTime',
      required: false
    },
    deliveredAt: {
      type: 'dateTime',
      required: false
    },
    cancelledAt: {
      type: 'dateTime',
      required: false
    },
    carrier: {
      type: 'string',
      required: false,
      maxLength: 50
    },
    trackingNumber: {
      type: 'string',
      required: false,
      maxLength: 100
    },
    note: {
      type: 'string',
      required: false,
      maxLength: 500
    }
  },
  relations: {
    customer: {
      model: 'User',
      type: 'oneToMany',
      mappedBy: 'orders',
      owner: true,
      output: {
        type: 'always'
      }
    },
    items: {
      model: 'OrderItem',
      type: 'oneToMany',
      mappedBy: 'order',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single',
        count: true
      }
    },
    coupon: {
      model: 'Coupon',
      type: 'oneToMany',
      mappedBy: 'orders',
      owner: true,
      required: false,
      output: {
        type: 'single'
      }
    }
  },
  // Changed by the workflow routes only, an admin may add a note
  update: {
    pick: ['note']
  },
  export: {
    shippingAddress: {
      exclude: true
    },
    customer: {
      headerName: 'Customer',
      mapValue: 'email'
    },
    total: {
      headerName: 'Total (EUR)',
      mapValue: (cents: number) => (cents / 100).toFixed(2)
    }
  },
  index: [
    ['customerId', '-createdAt'],
    ['status', 'createdAt']
  ]
});
