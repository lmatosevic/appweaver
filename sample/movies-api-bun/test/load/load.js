// The public catalog of the movies API, on Bun and SQLite through libsql: three genres per movie.

// The load definition of the sample, run by `npm run samples:manage -- load` (tools/load/README.md), given the
// scenario helpers of the harness
module.exports = ({ resourceScenarios, collectIds }) => ({
  database: 'sqlite (libsql)',
  port: 5005,
  auth: 'login',
  env: { RATE_LIMIT_ENABLED: 'false' },

  seed: {
    model: 'movie',
    prepare: async ({ ids }) => ({ genres: await ids('genre') }),
    // The IDs are nanoids, given here so the genres can be linked to the rows
    row: ({ index, runId, random }) => {
      const releaseDate = random.date(365 * 40);
      return {
        id: `load${runId}${index}`,
        title: random.sentence(random.int(1, 5)),
        slug: `load-${runId}-${index}`,
        tagline: random.sentence(8),
        overview: random.paragraph(3),
        status: random.pick(['Released', 'Released', 'Released', 'Announced', 'InProduction']),
        releaseDate,
        runtimeMinutes: random.int(70, 200),
        rating: random.int(10, 100) / 10,
        ratingCount: random.int(0, 20_000),
        trendingScore: random.int(0, 10_000) / 10,
        createdAt: releaseDate,
        updatedAt: releaseDate
      };
    },
    after: ({ rows, refs, random, link }) =>
      link(
        '_GenreMoviesMovie',
        rows.flatMap((movie) => random.sample(refs.genres, 3).map((genre) => [genre, movie.id]))
      )
  },

  prepare: async (api) => ({
    movies: await collectIds(api, '/api/movies', { auth: false }),
    genres: (await api.post('/api/genres/query', { size: 100, totalCount: false }, { auth: false })).items.map(
      (genre) => genre.id
    )
  }),

  scenarios: resourceScenarios({
    path: '/api/movies',
    bust: 'slug',
    findId: (c) => c.random.pick(c.movies),
    filterSort: () => ({ filter: { status: 'Released' }, sort: ['-trendingScore'] }),
    filterSortDescription: '`query`, `status`, `-trendingScore` (the trending list)',
    textSearch: true,
    relationFilter: (c) => ({ genres: { _some: { id: c.random.pick(c.genres) } } }),
    relationFilterDescription: '`query`, `genres: { _some: { id } }`',
    aggregate: { select: { rating: { avg: true }, runtimeMinutes: { avg: true } }, auth: false }
  })
});
