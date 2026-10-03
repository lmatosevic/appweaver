import { createAuthModel } from '@appweaver/core';

export default createAuthModel({
  name: 'User',
  scalars: {
    firstName: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      example: 'Olivia'
    },
    lastName: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      example: 'Bennett'
    },
    email: {
      type: 'string',
      unique: true,
      format: 'email',
      maxLength: 255,
      example: 'olivia@example.com'
    },
    phone: {
      type: 'string',
      required: false,
      maxLength: 32,
      example: '+15035550123'
    },
    marketingOptIn: {
      type: 'boolean',
      default: false
    }
  },
  relations: {
    addresses: {
      model: 'Address',
      type: 'oneToMany',
      mappedBy: 'user',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single'
      }
    },
    orders: {
      model: 'Order',
      type: 'oneToMany',
      mappedBy: 'customer',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    reviews: {
      model: 'Review',
      type: 'oneToMany',
      mappedBy: 'author',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  },
  virtual: {
    fullName: {
      type: 'string',
      input: {
        type: 'none'
      },
      output: {
        value: (user: { firstName: string; lastName: string }) =>
          `${user.firstName} ${user.lastName}`
      }
    }
  }
});
