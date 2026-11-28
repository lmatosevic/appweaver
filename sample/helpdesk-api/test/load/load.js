// The tickets of the helpdesk on MySQL (MariaDB), read by an agent: the staff reads every ticket.

// The load definition of the sample, run by `npm run samples:manage -- load` (tools/load/README.md), given the
// scenario helpers of the harness
module.exports = ({ resourceScenarios, collectIds }) => ({
  database: 'mysql',
  services: ['mysql'],
  port: 5004,
  // The admin signs in with an SMS code (004-enable-admin-sms-2fa), the demo agents with a password alone
  auth: { type: 'login', username: 'nicole@helpdesk.example.com', password: 'Passw0rd!' },
  env: { RATE_LIMIT_ENABLED: 'false', SMS_PROVIDER: 'json', MAILER_PROVIDER: 'json' },

  seed: {
    model: 'ticket',
    prepare: async ({ db, ids, insertMany, random }) => {
      if ((await db.customer.count()) < 1_000) {
        await insertMany(
          'customer',
          Array.from({ length: 1_000 }, (_, i) => ({
            email: `load-customer-${i}@example.com`,
            name: `${random.word()} ${random.word()}`,
            company: random.bool(0.5) ? `${random.word()} Ltd` : null,
            vip: random.bool(0.05)
          }))
        );
      }
      return { customers: await ids('customer'), teams: await ids('team'), agents: await ids('user') };
    },
    row: ({ index, runId, refs, random }) => {
      const createdAt = random.date(365);
      const status = random.pick(['New', 'Open', 'Open', 'Pending', 'Resolved', 'Closed', 'Closed']);
      return {
        reference: `LOAD-${runId}-${index}`,
        subject: random.sentence(random.int(4, 10)),
        status,
        priority: random.pick(['Low', 'Normal', 'Normal', 'High', 'Urgent']),
        channel: random.pick(['Web', 'Email', 'Api']),
        firstResponseDueAt: new Date(createdAt.getTime() + 4 * 3_600_000),
        resolutionDueAt: new Date(createdAt.getTime() + 48 * 3_600_000),
        resolvedAt: ['Resolved', 'Closed'].includes(status) ? new Date(createdAt.getTime() + 86_400_000) : null,
        escalated: random.bool(0.05),
        customerId: random.pick(refs.customers),
        teamId: random.pick(refs.teams),
        assigneeId: random.bool(0.8) ? random.pick(refs.agents) : null,
        createdAt,
        updatedAt: createdAt
      };
    }
  },

  prepare: async (api) => ({ tickets: await collectIds(api, '/api/tickets') }),

  scenarios: resourceScenarios({
    path: '/api/tickets',
    bust: 'reference',
    auth: true,
    findId: (c) => c.random.pick(c.tickets),
    filterSort: (c) => ({
      filter: { status: c.random.pick(['New', 'Open', 'Pending']), priority: c.random.pick(['High', 'Urgent']) },
      sort: ['resolutionDueAt']
    }),
    filterSortDescription: '`query`, `status` + `priority`, `resolutionDueAt` (the SLA queue)',
    textSearch: true,
    aggregate: { select: { createdAt: { count: true } } }
  })
});
