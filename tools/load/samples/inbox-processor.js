// The entries of the inbox processor on SQLite with Redis (BullMQ): the public reads of the processed entries.
const { resourceScenarios, collectIds } = require('../lib/scenarios');

module.exports = {
  database: 'sqlite',
  services: ['redis'],
  port: 5007,
  auth: 'none',
  env: { RATE_LIMIT_ENABLED: 'false' },

  seed: {
    model: 'entry',
    prepare: async () => ({}),
    row: ({ index, runId, random }) => {
      const createdAt = random.date(365);
      const status = random.pick(['Processed', 'Processed', 'Processed', 'Processed', 'Failed']);
      const text = `${random.paragraph(2)} ${runId}-${index}`;
      return {
        text,
        source: random.pick(['File', 'Api']),
        status,
        attempts: status === 'Failed' ? 3 : 1,
        words: text.split(' ').length,
        normalized: text.toLowerCase(),
        processedAt: createdAt,
        error: status === 'Failed' ? 'Load test failure' : null,
        createdAt,
        updatedAt: createdAt
      };
    }
  },

  prepare: async (api) => ({ entries: await collectIds(api, '/api/entries', { auth: false }) }),

  scenarios: resourceScenarios({
    path: '/api/entries',
    bust: 'text',
    findId: (c) => c.random.pick(c.entries),
    filterSort: () => ({ filter: { status: 'Failed' }, sort: ['-createdAt'] }),
    filterSortDescription: '`query`, `status`, `-createdAt`',
    textSearch: true,
    aggregate: { select: { words: { sum: true, avg: true } }, auth: false }
  })
};
