// The reports worker has no server: it is probed (idle wake-ups, memory) on its health listener, with the
// transactions its daily report and archive jobs read seeded to the size.
// The load definition of the sample, run by `npm run samples:manage -- load` (tools/load/README.md)
module.exports = () => ({
  database: 'sqlite',
  port: 5006,

  seed: {
    model: 'transaction',
    prepare: async () => ({}),
    row: ({ index, runId, random }) => {
      const occurredAt = random.date(365);
      return {
        reference: `LOAD-${runId}-${index}`,
        kind: random.pick(['Income', 'Expense']),
        category: random.pick(['Sales', 'Rent', 'Salaries', 'Utilities', 'Marketing', 'Refunds']),
        amount: random.int(100, 500_000),
        description: random.sentence(6),
        occurredAt,
        createdAt: occurredAt,
        updatedAt: occurredAt
      };
    }
  },

  scenarios: []
});
