// The product catalog of the webshop on PostgreSQL (TimescaleDB image) with Redis: the public reads see the active
// products only, an admin aggregates the prices.

// The load definition of the sample, run by `npm run samples:manage -- load` (tools/load/README.md), given the
// scenario helpers of the harness
module.exports = ({ resourceScenarios, collectIds }) => ({
  database: 'postgresql',
  services: ['postgres', 'redis'],
  port: 5002,
  auth: 'login',
  env: { RATE_LIMIT_ENABLED: 'false', TELEMETRY_ENABLED: 'false' },

  seed: {
    model: 'product',
    prepare: async ({ ids }) => ({ categories: await ids('category'), brands: await ids('brand') }),
    row: ({ index, runId, refs, random }) => {
      const createdAt = random.date(365);
      const price = random.int(199, 99_999);
      return {
        name: random.sentence(random.int(2, 5)),
        slug: `load-${runId}-${index}`,
        sku: `LOAD-${runId}-${index}`,
        description: random.paragraph(4),
        price,
        compareAtPrice: random.bool(0.2) ? price + random.int(100, 5_000) : null,
        stock: random.int(0, 500),
        status: random.pick(['Active', 'Active', 'Active', 'Draft', 'Archived']),
        weightGrams: random.int(50, 20_000),
        categoryId: random.pick(refs.categories),
        brandId: random.pick(refs.brands),
        createdAt,
        updatedAt: createdAt
      };
    }
  },

  prepare: async (api) => {
    const categories = await api.post('/api/categories/query', { size: 100, totalCount: false });
    return {
      active: await collectIds(api, '/api/products', { auth: false }),
      categories: categories.items.map((category) => category.id)
    };
  },

  scenarios: resourceScenarios({
    path: '/api/products',
    bust: 'sku',
    findId: (c) => c.random.pick(c.active),
    filterSort: (c) => ({ filter: { category: c.random.pick(c.categories) }, sort: ['price'] }),
    filterSortDescription: '`query`, `category`, `price` (the `(status, categoryId, price)` index)',
    textSearch: true,
    aggregate: { select: { price: { avg: true, min: true, max: true }, stock: { sum: true } } }
  })
});
