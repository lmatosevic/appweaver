import { createModel } from '@appweaver/core';

/** A reply on a ticket, from the customer or an agent, or an internal note. */
export default createModel({
  name: 'TicketMessage',
  scalars: {
    body: {
      type: 'string',
      minLength: 1,
      maxLength: 20000,
      example: 'Thanks, the corrected invoice is attached.'
    },
    // Seen by the agents only, never sent to the customer
    internal: {
      type: 'boolean',
      default: false
    },
    fromCustomer: {
      type: 'boolean',
      default: false
    }
  },
  relations: {
    ticket: {
      model: 'Ticket',
      type: 'manyToOne',
      mappedBy: 'messages',
      onDelete: 'cascade',
      output: {
        type: 'none'
      }
    },
    // The agent writing it, set to the signed-in user
    author: {
      model: 'User',
      type: 'manyToOne',
      mappedBy: 'messages',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'always'
      }
    }
  },
  files: {
    attachments: {
      array: true,
      maxCount: 5,
      mimeType: '(application/pdf|image/(jpeg|png)|text/plain)',
      namePattern: 'tickets/{year}/{month}/{hash}.{extension}',
      maxSize: '10 MB',
      output: {
        type: 'always',
        count: true
      }
    }
  },
  create: {
    omit: ['fromCustomer']
  },
  update: {
    pick: ['body']
  },
  // Threads are read oldest first, page by page
  index: [['ticketId', '+createdAt', '+id']]
});
