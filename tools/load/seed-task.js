// The seeder of the load tests, run by tools/load/run-load.js in the directory of a sample with
//   weaver run <this file> <rows>
// so it inserts through the Prisma client of the application, on whatever database the sample uses. It tops the
// main model of the sample up to the number of rows, and is a no-op once it holds that many.
const { injectDatabaseClient } = require('@appweaver/core');
const { resolveDatabaseType } = require('@appweaver/common');
const { databaseConfig } = require('@appweaver/data/config');
const { loadSample } = require('./lib/samples');
const { createSeedHelpers } = require('./lib/seed-helpers');

const chunkSize = 10_000;

module.exports = async function seedLoad([rows]) {
  const sample = loadSample();
  const name = sample.name;
  const target = Number(rows);
  const seed = sample.seed;
  if (!seed) {
    console.log(`${name} has no load seeder`);
    return 0;
  }

  const db = injectDatabaseClient();
  const dbType = resolveDatabaseType(databaseConfig.TYPE, databaseConfig.URL);
  const helpers = createSeedHelpers(db, dbType);
  const current = await db[seed.model].count();
  if (current >= target) {
    console.log(`${name}: ${seed.model} holds ${current} rows, none to add`);
    return 0;
  }

  const refs = await seed.prepare(helpers);
  const runId = Date.now().toString(36);
  const started = Date.now();
  for (let offset = current; offset < target; offset += chunkSize) {
    const count = Math.min(chunkSize, target - offset);
    const before = await helpers.lastId(seed.model);
    const data = Array.from({ length: count }, (_, i) =>
      seed.row({ index: offset + i, runId, refs, ...helpers })
    );
    await helpers.insertMany(seed.model, data);
    if (seed.after) {
      const ids = await helpers.idsAfter(seed.model, before);
      await seed.after({ ...helpers, insertedIds: ids, rows: data, refs });
    }
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${name}: ${offset + count} / ${target} ${seed.model} rows (${elapsed} s)`);
  }
  return 0;
};
