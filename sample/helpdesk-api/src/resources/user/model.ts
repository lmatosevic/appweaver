import { createAuthModel } from '@appweaver/core';

/** The support staff, and the integrations calling the API with a key. */
export default createAuthModel({
  name: 'User',
  scalars: {
    name: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      example: 'Nicole Agent'
    },
    email: {
      type: 'string',
      unique: true,
      format: 'email',
      maxLength: 255,
      example: 'nicole@helpdesk.example.com'
    },
    // Agents away are left out of the automatic assignment
    available: {
      type: 'boolean',
      default: true
    }
  },
  relations: {
    team: {
      model: 'Team',
      type: 'oneToMany',
      mappedBy: 'members',
      owner: true,
      required: false,
      output: {
        type: 'always'
      }
    },
    assignedTickets: {
      model: 'Ticket',
      type: 'oneToMany',
      mappedBy: 'assignee',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    messages: {
      model: 'TicketMessage',
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
  }
});
