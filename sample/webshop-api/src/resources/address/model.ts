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
      example: 'Iva Perić'
    },
    street: {
      type: 'string',
      minLength: 2,
      maxLength: 200,
      example: 'Ilica 10'
    },
    city: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      example: 'Zagreb'
    },
    postalCode: {
      type: 'string',
      maxLength: 20,
      example: '10000'
    },
    // ISO 3166-1 alpha-2
    country: {
      type: 'string',
      pattern: '^[A-Z]{2}$',
      example: 'HR'
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
      type: 'oneToMany',
      mappedBy: 'addresses',
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
  }
});
