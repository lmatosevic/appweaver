const { randomBytes } = require('crypto');

// Under the bound parameters of each database: SQL Server takes 2,100, SQLite 32,766, the others 65,535
const maxParameters = { sqlserver: 2_000, sqlite: 30_000, postgresql: 60_000, mysql: 60_000 };

/**
 * The helpers a sample's `seed` uses to insert many rows through the Prisma client of the application, in batches
 * sized for the database.
 *
 * @param {object} db - The Prisma client of the application.
 * @param {string} dbType - The `DatabaseType` of the database.
 */
function createSeedHelpers(db, dbType) {
  const quote = (name) =>
    dbType === 'mysql' ? `\`${name}\`` : dbType === 'sqlserver' ? `[${name}]` : `"${name}"`;
  const literal = (value) =>
    typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`;

  /** Inserts rows with `createMany`, in batches under the parameter limit of the database. */
  async function insertMany(model, rows) {
    if (rows.length === 0) {
      return;
    }
    const columns = Math.max(1, Object.keys(rows[0]).length);
    const batchSize = Math.max(1, Math.min(1_000, Math.floor(maxParameters[dbType] / columns)));
    for (let i = 0; i < rows.length; i += batchSize) {
      await db[model].createMany({ data: rows.slice(i, i + batchSize) });
    }
  }

  /**
   * Inserts the rows of an implicit many-to-many table (`_PostTagsTag`, columns `A` and `B`) in multi-row inserts,
   * which `createMany` cannot do.
   */
  async function link(table, pairs, columns = ['A', 'B']) {
    const batchSize = dbType === 'sqlserver' ? 900 : 1_000;
    for (let i = 0; i < pairs.length; i += batchSize) {
      const values = pairs
        .slice(i, i + batchSize)
        .map((pair) => `(${pair.map(literal).join(', ')})`)
        .join(', ');
      await db.$executeRawUnsafe(
        `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES ${values}`
      );
    }
  }

  /** The IDs of the rows of a model after the given ID (the last ID before an insert), in order. */
  async function idsAfter(model, afterId) {
    const rows = await db[model].findMany({
      where: afterId === undefined ? {} : { id: { gt: afterId } },
      select: { id: true },
      orderBy: { id: 'asc' }
    });
    return rows.map((row) => row.id);
  }

  /** The last ID of a model, by order. */
  async function lastId(model) {
    const row = await db[model].findFirst({ select: { id: true }, orderBy: { id: 'desc' } });
    return row?.id;
  }

  /** The IDs of a model matching a filter. */
  async function ids(model, where = {}) {
    const rows = await db[model].findMany({ where, select: { id: true } });
    return rows.map((row) => row.id);
  }

  return { db, dbType, insertMany, link, idsAfter, lastId, ids, random: createRandom() };
}

/** Random values for the seeded rows and the requests, with a seed so two runs build the same data. */
function createRandom(seed = 42) {
  let state = seed >>> 0;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const words = (
    'trail river mountain coffee city garden winter summer travel guide recipe review story market ' +
    'design code night light ocean forest bread music history science future simple quiet bright ' +
    'north south harbor village island valley stone field window street paper letter season road'
  ).split(' ');
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (values) => values[Math.floor(next() * values.length)];
  const sentence = (count) =>
    Array.from({ length: count }, () => pick(words)).join(' ').replace(/^./, (c) => c.toUpperCase());
  return {
    next,
    int,
    pick,
    /** Picks `count` distinct values. */
    sample: (values, count) => {
      const picked = new Set();
      while (picked.size < Math.min(count, values.length)) {
        picked.add(pick(values));
      }
      return [...picked];
    },
    bool: (probability = 0.5) => next() < probability,
    word: () => pick(words),
    words,
    sentence,
    paragraph: (sentences = 5) => Array.from({ length: sentences }, () => `${sentence(int(6, 14))}.`).join(' '),
    /** A date in the last `days` days. */
    date: (days = 365) => new Date(Date.now() - Math.floor(next() * days * 86_400_000)),
    /** A random token, never cached: crypto random, not seeded. */
    token: () => randomBytes(6).toString('hex')
  };
}

module.exports = { createSeedHelpers, createRandom };
