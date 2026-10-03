import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Ticket',
  id: {
    generator: 'cuid(2)'
  },
  scalars: {
    // The short reference a customer quotes, i.e. HD-7K2Q9X
    reference: {
      type: 'string',
      unique: true,
      example: 'HD-7K2Q9X'
    },
    subject: {
      type: 'string',
      minLength: 3,
      maxLength: 200,
      example: 'Invoice charges sales tax we are exempt from'
    },
    status: {
      type: 'enum',
      values: ['New', 'Open', 'Pending', 'Resolved', 'Closed'],
      default: 'New'
    },
    priority: {
      type: 'enum',
      values: ['Low', 'Normal', 'High', 'Urgent'],
      default: 'Normal'
    },
    channel: {
      type: 'enum',
      values: ['Web', 'Email', 'Api'],
      default: 'Api'
    },
    // Set from the SLA policy of the priority
    firstResponseDueAt: {
      type: 'dateTime',
      required: false
    },
    resolutionDueAt: {
      type: 'dateTime',
      required: false
    },
    firstRespondedAt: {
      type: 'dateTime',
      required: false
    },
    resolvedAt: {
      type: 'dateTime',
      required: false
    },
    // Raised by the escalation job once the resolution is overdue
    escalated: {
      type: 'boolean',
      default: false
    }
  },
  relations: {
    // Matched by email, created with the ticket when unknown
    customer: {
      model: 'Customer',
      type: 'manyToOne',
      mappedBy: 'tickets',
      input: {
        type: 'create',
        allowCreate: true,
        uniqueKey: 'email'
      },
      output: {
        type: 'always'
      }
    },
    team: {
      model: 'Team',
      type: 'manyToOne',
      mappedBy: 'tickets',
      required: false,
      output: {
        type: 'always'
      }
    },
    // Assigned automatically when left empty, see the assignment feature
    assignee: {
      model: 'User',
      type: 'manyToOne',
      mappedBy: 'assignedTickets',
      required: false,
      output: {
        type: 'always'
      }
    },
    // Unknown tags are created on the fly, matched by their slug
    tags: {
      model: 'Tag',
      type: 'manyToMany',
      mappedBy: 'tickets',
      required: false,
      input: {
        type: 'all',
        allowCreate: true,
        uniqueKey: 'slug'
      },
      output: {
        type: 'always'
      }
    },
    messages: {
      model: 'TicketMessage',
      type: 'oneToMany',
      mappedBy: 'ticket',
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
  virtual: {
    // The first message of the ticket, stored as its opening message
    description: {
      type: 'string',
      maxLength: 20000,
      input: {
        type: 'create'
      },
      output: {
        type: 'none'
      }
    },
    overdue: {
      type: 'boolean',
      input: {
        type: 'none'
      },
      output: {
        value: (ticket: {
          status: string;
          resolutionDueAt?: Date | string | null;
        }) =>
          !['Resolved', 'Closed'].includes(ticket.status) &&
          !!ticket.resolutionDueAt &&
          new Date(ticket.resolutionDueAt) < new Date()
      }
    }
  },
  create: {
    omit: [
      'reference',
      'status',
      'firstResponseDueAt',
      'resolutionDueAt',
      'firstRespondedAt',
      'resolvedAt',
      'escalated'
    ]
  },
  update: {
    omit: [
      'reference',
      'channel',
      'firstResponseDueAt',
      'resolutionDueAt',
      'firstRespondedAt',
      'resolvedAt',
      'escalated'
    ]
  },
  export: {
    customer: {
      headerName: 'Customer',
      mapValue: 'email'
    },
    team: {
      headerName: 'Team',
      mapValue: 'name'
    },
    assignee: {
      headerName: 'Assignee',
      mapValue: 'name'
    },
    tags: {
      headerName: 'Tags',
      mapValue: 'name'
    }
  },
  index: [
    ['status', 'priority', 'resolutionDueAt'],
    ['assigneeId', 'status']
  ]
});
