import { createModel } from '@appweaver/core';

/** A shipping address saved to the account of a customer. */
export default createModel({
  name: 'Address',
  scalars: {
    label: {
      type: 'string',
      maxLength: 50,
      default: 'Home',
      example: 'Home'
    },
    recipient: {
      type: 'string',
      minLength: 2,
      maxLength: 150,
      example: 'Olivia Bennett'
    },
    street: {
      type: 'string',
      minLength: 2,
      maxLength: 200,
      example: '1200 Maple Avenue'
    },
    city: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      example: 'Portland'
    },
    postalCode: {
      type: 'string',
      maxLength: 20,
      example: '97205'
    },
    // ISO 3166-1 alpha-2
    country: {
      type: 'string',
      pattern: '^[A-Z]{2}$',
      example: 'US'
    },
    isDefault: {
      type: 'boolean',
      default: false
    }
  },
  relations: {
    // Set to the signed-in customer
    user: {
      model: 'User',
      type: 'manyToOne',
      mappedBy: 'addresses',
      required: false,
      onDelete: 'cascade',
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  }
});
