import fsp from 'node:fs/promises';
import path from 'node:path';
import { runProcessOutput } from '../utils';

/** The migrations `prisma migrate deploy` would apply, from the status of the database. */
export type MigrationPlan =
  | { status: 'up-to-date' }
  | {
      status: 'pending';
      migrations: string[];
      /** The database they apply to: one to create, one without a migration history, or one with it. */
      database: 'missing' | 'unmanaged' | 'managed';
    }
  | { status: 'error'; code: number; output: string };

/** A pending migration with its SQL, `undefined` when its `migration.sql` file is missing. */
export type PendingMigration = { name: string; sql?: string };

const DEBUG_NAMESPACE = 'prisma:migrate:status';

/** The debug log entries of `prisma migrate status`: the namespace, a JSON object and the elapsed time. */
const DEBUG_ENTRIES = new RegExp(
  `${DEBUG_NAMESPACE} \\{[\\s\\S]*?\\n\\} \\+\\d+ms\\n?`,
  'g'
);

/**
 * Reads the migrations `prisma migrate deploy` would apply, without changing the database, from the output of
 * `prisma migrate status`. A database that does not exist yet has every migration of the directory pending.
 *
 * @param {string} migrationsDir - The migrations directory.
 * @return {Promise<MigrationPlan>} The pending migrations, or the error of the status, i.e. a failed migration.
 */
export async function planMigrations(
  migrationsDir: string
): Promise<MigrationPlan> {
  // The debug log holds the diagnosis of the schema engine
  const { code, stdout, stderr } = await runProcessOutput(
    'prisma',
    ['migrate', 'status'],
    { DEBUG: DEBUG_NAMESPACE, DEBUG_COLORS: 'false' }
  );

  if (code === 0) {
    return { status: 'up-to-date' };
  }
  // P1003: the database does not exist
  if (stderr.includes('P1003')) {
    return {
      status: 'pending',
      migrations: await localMigrations(migrationsDir),
      database: 'missing'
    };
  }

  const migrations = pendingMigrationNames(stdout);
  if (migrations.length === 0) {
    const output = `${stdout}\n${stderr.replace(DEBUG_ENTRIES, '')}`.trim();
    return { status: 'error', code, output };
  }

  const { failedMigrationNames: failed = [], hasMigrationsTable = true } =
    statusDiagnosis(stderr);
  // The status leaves a failed migration out while others are pending, though none is applied until it is resolved
  if (failed.length > 0) {
    const output =
      `Following migration${failed.length > 1 ? 's' : ''} have failed:\n${failed.join('\n')}\n\n` +
      'No migration is applied until they are resolved, see https://pris.ly/d/migrate-resolve';
    return { status: 'error', code, output };
  }

  return {
    status: 'pending',
    migrations,
    database: hasMigrationsTable ? 'managed' : 'unmanaged'
  };
}

/**
 * Reads the SQL of the pending migrations.
 *
 * @param {string} migrationsDir - The migrations directory.
 * @param {string[]} names - The names of the pending migrations.
 * @return {Promise<PendingMigration[]>} Every migration with its SQL.
 */
export async function readMigrations(
  migrationsDir: string,
  names: string[]
): Promise<PendingMigration[]> {
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await fsp
        .readFile(path.join(migrationsDir, name, 'migration.sql'), 'utf8')
        .catch(() => undefined)
    }))
  );
}

/**
 * Parses the names `prisma migrate status` lists under "Following migration(s) have not yet been applied:", one per
 * line until an empty line.
 *
 * @param {string} output - The standard output of `prisma migrate status`.
 * @return {string[]} The names of the pending migrations.
 */
export function pendingMigrationNames(output: string): string[] {
  const listed =
    /have not yet been applied:\r?\n([\s\S]*?)(?:\r?\n\s*\r?\n|$)/.exec(output);
  return (listed?.[1] ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Reads the diagnosis of the schema engine from the debug log of `prisma migrate status`: the failed migrations and
 * whether the database has a migration history, which its output leaves out while migrations are pending. Empty when
 * Prisma logs none, so the plan then relies on the output alone.
 */
function statusDiagnosis(stderr: string): {
  failedMigrationNames?: string[];
  hasMigrationsTable?: boolean;
} {
  for (const entry of stderr.match(DEBUG_ENTRIES) ?? []) {
    try {
      const json = entry.slice(entry.indexOf('{'), entry.lastIndexOf('}') + 1);
      const { diagnoseResult } = JSON.parse(json);
      if (diagnoseResult) {
        return JSON.parse(diagnoseResult);
      }
    } catch {
      // Not the diagnosis
    }
  }
  return {};
}

/** The migrations of the directory, in the order Prisma applies them. */
async function localMigrations(migrationsDir: string): Promise<string[]> {
  const entries = await fsp
    .readdir(migrationsDir, { withFileTypes: true })
    .catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
