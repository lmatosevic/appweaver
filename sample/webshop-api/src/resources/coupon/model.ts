import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Coupon',
  scalars: {
    code: {
      type: 'string',
      unique: true,
      pattern: '^[A-Z0-9]{4,20}$',
      example: 'WELCOME10'
    },
    type: {
      type: 'enum',
      values: ['Percentage', 'Fixed'],
      default: 'Percentage'
    },
    // Percent for a percentage coupon, cents for a fixed one
    value: {
      type: 'int',
      minimum: 1,
      example: 10
    },
    // In cents
    minOrderTotal: {
      type: 'int',
      default: 0,
      minimum: 0
    },
    validFrom: {
      type: 'dateTime',
      required: false
    },
    validUntil: {
      type: 'dateTime',
      required: false
    },
    maxRedemptions: {
      type: 'int',
      required: false,
      minimum: 1
    },
    redemptions: {
      type: 'int',
      default: 0,
      minimum: 0
    },
    active: {
      type: 'boolean',
      default: true
    }
  },
  relations: {
    orders: {
      model: 'Order',
      type: 'oneToMany',
      mappedBy: 'coupon',
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
  create: {
    omit: ['redemptions']
  },
  update: {
    omit: ['redemptions']
  }
});
