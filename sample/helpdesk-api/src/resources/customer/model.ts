import { createModel } from '@appweaver/core';

/**
 * Whoever asked for help. Customers hold no account, they are matched by their
 * email whenever a ticket comes in.
 */
export default createModel({
  name: 'Customer',
  scalars: {
    email: {
      type: 'string',
      unique: true,
      format: 'email',
      maxLength: 255,
      example: 'petra@acme.example.com'
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 150,
      example: 'Petra Novak'
    },
    company: {
      type: 'string',
      required: false,
      maxLength: 150,
      example: 'Acme d.o.o.'
    },
    vip: {
      type: 'boolean',
      default: false
    }
  },
  relations: {
    tickets: {
      model: 'Ticket',
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
    }
  }
});
