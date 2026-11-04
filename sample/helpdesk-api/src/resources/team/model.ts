import { createModel } from '@appweaver/data';

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
  },
  // The workload of the team every 15 minutes, written to InfluxDB by the
  // metrics job, for the dashboards of the support leads
  series: {
    open: {
      type: 'int',
      minimum: 0,
      description: 'Tickets not resolved yet'
    },
    unassigned: {
      type: 'int',
      minimum: 0,
      description: 'Open tickets without an agent'
    },
    overdue: {
      type: 'int',
      minimum: 0,
      description: 'Open tickets past their resolution target'
    },
    firstResponseMinutes: {
      type: 'float',
      minimum: 0,
      description:
        'Average minutes to the first response of the tickets answered since the previous point'
    },
    breached: {
      type: 'boolean',
      description: 'Whether a ticket of the team is overdue'
    }
  }
});
