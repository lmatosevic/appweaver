import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Tag',
  scalars: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      example: 'Invoices'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      example: 'invoices'
    }
  },
  relations: {
    tickets: {
      model: 'Ticket',
      type: 'manyToMany',
      mappedBy: 'tags',
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
