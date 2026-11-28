// The scenarios of E2 (PLAN-v3.md): the posts of the CMS, read anonymously through the public routes, every request
// with a random value in its filter so the response cache never answers, except in `query-cached`.
// The load definition of the sample, run by `npm run samples:manage -- load` (tools/load/README.md)
module.exports = () => ({
  database: 'sqlite',
  services: ['redis'],
  port: 5001,
  auth: 'basic',
  env: {
    RATE_LIMIT_ENABLED: 'false',
    SECURITY_RECAPTCHA_ENABLED: 'false',
    SECURITY_OAUTH2_GOOGLE_ENABLED: 'false',
    SECURITY_OAUTH2_FACEBOOK_ENABLED: 'false'
  },

  seed: {
    model: 'post',
    prepare: async ({ db, insertMany, ids, random }) => {
      if ((await db.tag.count()) < 50) {
        await insertMany(
          'tag',
          Array.from({ length: 50 }, (_, i) => ({ name: `Load ${random.word()} ${i}`, slug: `load-tag-${i}` }))
        );
      }
      if ((await db.category.count()) < 10) {
        await insertMany(
          'category',
          Array.from({ length: 10 }, (_, i) => ({ name: `Load category ${i}`, slug: `load-category-${i}` }))
        );
      }
      return {
        tags: await ids('tag'),
        categories: await ids('category'),
        authors: await ids('user')
      };
    },
    row: ({ index, runId, refs, random }) => {
      const createdAt = random.date(365);
      const status = random.pick(['Published', 'Published', 'Published', 'Draft', 'Archived']);
      return {
        title: random.sentence(random.int(3, 8)),
        slug: `load-${runId}-${index}`,
        excerpt: random.sentence(16),
        content: random.paragraph(8),
        status,
        publishedAt: status === 'Draft' ? null : createdAt,
        featured: random.bool(0.05),
        viewCount: random.int(0, 5_000),
        authorId: random.pick(refs.authors),
        categoryId: random.pick(refs.categories),
        createdAt,
        updatedAt: createdAt
      };
    },
    // Two tags per post
    after: ({ insertedIds, refs, random, link }) =>
      link(
        '_PostTagsTag',
        insertedIds.flatMap((id) => random.sample(refs.tags, 2).map((tag) => [id, tag]))
      )
  },

  prepare: async (api) => {
    const first = await api.post('/api/posts/query', { sort: ['id'], size: 1, totalCount: false });
    const last = await api.post('/api/posts/query', { sort: ['-id'], size: 1, totalCount: false });
    const tags = await api.get('/api/tags/query?size=50&totalCount=false');
    const categories = await api.post('/api/categories/query', { size: 50, totalCount: false });
    // Anonymous reads see the published posts only (V3-SAMPLE-01), so `find` picks among those
    const published = [];
    for (let page = 1; page <= 10; page++) {
      const result = await api.post('/api/posts/query', { page, size: 100, sort: ['id'], totalCount: false }, { auth: false });
      published.push(...result.items.map((post) => post.id));
    }
    return {
      published,
      firstId: first.items[0].id,
      lastId: last.items[0].id,
      tags: tags.items.map((tag) => tag.id),
      categories: categories.items.map((category) => category.id)
    };
  },

  scenarios: [
    {
      name: 'find',
      description: '`find` by ID, among 1,000 published posts',
      // A random query string, so the response cache of the route never answers
      path: (c) => `/api/posts/${c.random.pick(c.published)}?load=${c.random.token()}`
    },
    {
      name: 'query-count',
      description: '`query`, first page, with the total count',
      method: 'POST',
      path: '/api/posts/query',
      body: (c) => ({ filter: { title: { _ne: c.random.token() } }, totalCount: true })
    },
    {
      name: 'query',
      description: '`query`, first page, `totalCount: false`',
      method: 'POST',
      path: '/api/posts/query',
      body: (c) => ({ filter: { title: { _ne: c.random.token() } }, totalCount: false })
    },
    {
      name: 'query-deep-page',
      description: '`query`, random deep page (offset, within the 10,000 records of resource.maxOffset)',
      method: 'POST',
      path: '/api/posts/query',
      body: (c) => ({
        filter: { title: { _ne: c.random.token() } },
        page: c.random.int(1, Math.min(201, Math.max(1, Math.floor((c.lastId - c.firstId) / 50)))),
        totalCount: false
      })
    },
    {
      name: 'query-filter-sort',
      description: '`query`, `status` + `category`, `-publishedAt`',
      method: 'POST',
      path: '/api/posts/query',
      body: (c) => ({
        filter: { status: 'Published', category: c.random.pick(c.categories), title: { _ne: c.random.token() } },
        sort: ['-publishedAt'],
        totalCount: false
      })
    },
    {
      name: 'query-text-search',
      description: '`query`, `searchText` (`contains` on 3 text columns)',
      method: 'POST',
      path: '/api/posts/query',
      body: (c) => ({ filter: { searchText: `${c.random.word()} ${c.random.token()}`.slice(0, 12) }, totalCount: false })
    },
    {
      name: 'query-relation-filter',
      description: '`query`, `tags: { _some: { id } }`',
      method: 'POST',
      path: '/api/posts/query',
      body: (c) => ({
        filter: { tags: { _some: { id: c.random.pick(c.tags) } }, title: { _ne: c.random.token() } },
        totalCount: false
      })
    },
    {
      name: 'query-cached',
      description: '`query`, cached (the same request every time)',
      method: 'POST',
      path: '/api/posts/query',
      body: { totalCount: false }
    },
    {
      name: 'aggregate-year',
      description: '`aggregate`, one year (13 periods), as an admin',
      method: 'POST',
      path: '/api/posts/aggregate',
      auth: true,
      body: (c) => ({
        select: { viewCount: { sum: true, avg: true } },
        filter: { title: { _ne: c.random.token() } },
        from: new Date(Date.now() - 365 * 86_400_000).toISOString(),
        to: new Date().toISOString()
      })
    }
  ]
});
