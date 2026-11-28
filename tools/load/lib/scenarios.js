/**
 * The standard scenarios of a resource, the ones of E2 (PLAN-v3.md), so every sample is measured the same way. Each
 * request carries a random value (`bust`, a string field compared with `_ne`, or a random query string for `find`),
 * so the response cache of a route never answers, except in `query-cached`.
 *
 * @param {object} options
 * @param {string} options.path - The path of the routes, i.e. `/api/products`.
 * @param {string} options.bust - A string field of the model, filtered with `_ne` and a random value.
 * @param {function} options.findId - Picks the ID of a record readable by the requests, from the context.
 * @param {boolean} [options.auth] - Whether the requests carry the credentials of the sample.
 * @param {function} [options.filterSort] - The `{ filter, sort }` of the `query-filter-sort` scenario.
 * @param {function} [options.relationFilter] - The filter of the `query-relation-filter` scenario.
 * @param {boolean} [options.textSearch] - Adds the `query-text-search` scenario (`searchText`).
 * @param {object} [options.aggregate] - The `select` of the `aggregate-year` scenario, and its `auth`.
 */
function resourceScenarios(options) {
  const { path, bust, auth = false } = options;
  const bustFilter = (c, filter = {}) => ({ ...filter, [bust]: { _ne: c.random.token() } });
  const query = (name, description, body) => ({
    name,
    description,
    method: 'POST',
    path: `${path}/query`,
    auth,
    body
  });

  const scenarios = [
    {
      name: 'find',
      description: '`find` by ID',
      path: (c) => `${path}/${options.findId(c)}?load=${c.random.token()}`,
      auth
    },
    query('query-count', '`query`, first page, with the total count', (c) => ({
      filter: bustFilter(c),
      totalCount: true
    })),
    query('query', '`query`, first page, `totalCount: false`', (c) => ({ filter: bustFilter(c), totalCount: false })),
    query('query-deep-page', '`query`, random deep page (offset)', (c) => ({
      filter: bustFilter(c),
      page: c.random.int(1, Math.max(1, Math.floor(c.size / 50) - 1)),
      totalCount: false
    }))
  ];
  if (options.filterSort) {
    scenarios.push(
      query('query-filter-sort', options.filterSortDescription ?? '`query`, filter and sort', (c) => {
        const { filter, sort } = options.filterSort(c);
        return { filter: bustFilter(c, filter), sort, totalCount: false };
      })
    );
  }
  if (options.textSearch) {
    scenarios.push(
      query('query-text-search', '`query`, `searchText` (`contains`)', (c) => ({
        filter: { searchText: `${c.random.word()} ${c.random.token()}`.slice(0, 12) },
        totalCount: false
      }))
    );
  }
  if (options.relationFilter) {
    scenarios.push(
      query('query-relation-filter', options.relationFilterDescription ?? '`query`, relation filter', (c) => ({
        filter: bustFilter(c, options.relationFilter(c)),
        totalCount: false
      }))
    );
  }
  scenarios.push(query('query-cached', '`query`, cached (the same request every time)', { totalCount: false }));
  if (options.aggregate) {
    scenarios.push({
      name: 'aggregate-year',
      description: '`aggregate`, one year (13 periods)',
      method: 'POST',
      path: `${path}/aggregate`,
      auth: options.aggregate.auth ?? true,
      body: (c) => ({
        select: options.aggregate.select,
        ...(options.aggregate.dateField ? { dateField: options.aggregate.dateField } : {}),
        filter: bustFilter(c),
        from: new Date(Date.now() - 365 * 86_400_000).toISOString(),
        to: new Date().toISOString()
      })
    });
  }
  return scenarios;
}

/** Collects the IDs of the first pages of a query, the records a `find` reads. */
async function collectIds(api, path, { pages = 10, size = 100, body = {}, auth = true } = {}) {
  const ids = [];
  for (let page = 1; page <= pages; page++) {
    const result = await api.post(`${path}/query`, { ...body, page, size, totalCount: false }, { auth });
    ids.push(...result.items.map((item) => item.id));
    if (result.items.length < size) {
      break;
    }
  }
  return ids;
}

module.exports = { resourceScenarios, collectIds };
