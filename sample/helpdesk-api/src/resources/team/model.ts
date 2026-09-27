import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Team',
  scalars: {
    name: {
      type: 'string',
      unique: true,
      minLength: 2,
      maxLength: 100,
      example: 'Billing'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      example: 'billing'
    },
    // Where the escalations of the team are sent
    email: {
      type: 'string',
      format: 'email',
      maxLength: 255,
      example: 'billing@helpdesk.example.com'
    }
  },
  relations: {
    members: {
      model: 'User',
      type: 'oneToMany',
      mappedBy: 'team',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single',
        count: true
      }
    },
    tickets: {
      model: 'Ticket',
      type: 'oneToMany',
      mappedBy: 'team',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    cannedResponses: {
      model: 'CannedResponse',
      type: 'oneToMany',
      mappedBy: 'team',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  }
});
