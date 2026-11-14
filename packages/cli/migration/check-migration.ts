import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPrismaSchema, validateRelations } from '../generate';
import { planMigrations } from '../migrate/plan-migrations';
import {
  geoStorage,
  importPackage,
  loadModels,
  runProcessOutput,
  seriesInDatabase
} from '../utils';

export type CheckMigrationOptions = {
  /** The glob pattern of the model files, from the config by default. */
  modelPattern?: string;
  /** Whether to leave out the framework models the project does not use, like `weaver generate` does. */
  prune?: boolean;
};

/** The exit codes of the check, the ones of `diff`: no difference, a difference, and a check that cannot run. */
export const CHECK_UP_TO_DATE = 0;
export const CHECK_MIGRATION_NEEDED = 1;
export const CHECK_FAILED = 2;

/**
 * Checks whether the resource models need a new migration, printing the SQL `weaver migration new` would create. The
 * Prisma schema is built from the models without writing it, so a schema file out of date with them is told apart,
 * then compared with the database, which must have every migration applied.
 *
 * @param {CheckMigrationOptions} [options={}] - The model pattern and the pruning of the models.
 * @return {Promise<number>} `0` when no migration is needed, `1` when one is, `2` when the check cannot run, i.e. on
 * pending migrations or an unreachable database.
 */
export async function checkMigration(
  options: CheckMigrationOptions = {}
): Promise<number> {
  const { databaseConfig, resourceConfig, spatialProvider } =
    await importPackage<typeof import('@appweaver/data/config')>(
      '@appweaver/data/config',
      'migration check'
    );

  const { models, modules } = await loadModels(
    options.modelPattern ?? resourceConfig.MODEL_PATTERN,
    options.prune
  );
  const relationErrors = validateRelations(models);
  if (relationErrors.length > 0) {
    relationErrors.forEach((error) => console.error(error));
    return CHECK_FAILED;
  }

  const schema = buildPrismaSchema(
    models,
    databaseConfig.SCHEMA_PATH,
    databaseConfig.CLIENT_OUTPUT_DIR_PATH,
    seriesInDatabase(modules),
    geoStorage(models, spatialProvider)
  );
  const generated = await fsp
    .readFile(path.resolve(databaseConfig.SCHEMA_PATH), 'utf8')
    .catch(() => '');
  const outdated = generated.replace(/\r\n/g, '\n') !== schema;

  const plan = await planMigrations(
    path.resolve(databaseConfig.MIGRATIONS_DIR_PATH)
  );
  if (plan.status === 'error') {
    console.error(plan.output);
    return CHECK_FAILED;
  }
  // A project without a migration and a database needs its first one, any other database is compared once migrated
  const first = plan.status === 'pending' && plan.migrations.length === 0;
  if (plan.status === 'pending' && !first) {
    const count = plan.migrations.length;
    console.error(
      `The database has ${count} pending migration${count === 1 ? '' : 's'}, ` +
        'run "weaver migrate" before checking for a new one.'
    );
    return CHECK_FAILED;
  }

  const diff = await diffSchema(
    first ? '--from-empty' : '--from-config-datasource',
    schema
  );
  if (diff.code !== 0 && diff.code !== 2) {
    console.error(`${diff.stdout}\n${diff.stderr}`.trim());
    return CHECK_FAILED;
  }

  const generate = outdated ? 'weaver generate && ' : '';
  if (diff.code === 0) {
    console.log('No migration needed, the database matches the models.');
    if (outdated) {
      console.log(
        'The Prisma schema is out of date with the models though, update it with "weaver generate".'
      );
    }
    return CHECK_UP_TO_DATE;
  }

  console.log('A migration is needed, it would run:\n');
  console.log(diff.stdout.trim());
  console.log(`\nCreate it with: ${generate}weaver migration new <name>`);
  return CHECK_MIGRATION_NEEDED;
}

/**
 * Compares a source with a Prisma schema, as the SQL changing the source into the schema. The schema is read from a
 * temporary file, so the one of the project stays as it is.
 *
 * @param {string} from - The source flag of `prisma migrate diff`, i.e. `--from-config-datasource`.
 * @param {string} schema - The content of the schema.
 * @return The exit code of `prisma migrate diff --exit-code` (`0` without a difference, `2` with one) and its output.
 */
async function diffSchema(
  from: string,
  schema: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'weaver-check-'));
  const schemaPath = path.join(dir, 'schema.prisma');
  try {
    await fsp.writeFile(schemaPath, schema);
    return await runProcessOutput('prisma', [
      'migrate',
      'diff',
      from,
      '--to-schema',
      `"${schemaPath}"`,
      '--script',
      '--exit-code'
    ]);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
