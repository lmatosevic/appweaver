import fsp from 'node:fs/promises';
import path from 'node:path';
import { runProcessOutput } from '../utils';

/** The migrations `prisma migrate deploy` would apply, from the status of the database. */
export type MigrationPlan =
  | { status: 'up-to-date' }
  | { status: 'pending'; migrations: string[]; databaseMissing: boolean }
  | { status: 'error'; code: number; output: string };

/** A pending migration with its SQL, `undefined` when its `migration.sql` file is missing. */
export type PendingMigration = { name: string; sql?: string };

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
  const { code, stdout, stderr } = await runProcessOutput('prisma', [
    'migrate',
    'status'
  ]);
  const output = `${stdout}\n${stderr}`;

  if (code === 0) {
    return { status: 'up-to-date' };
  }
  // P1003: the database does not exist
  if (output.includes('P1003')) {
    return {
      status: 'pending',
      migrations: await localMigrations(migrationsDir),
      databaseMissing: true
    };
  }

  const migrations = pendingMigrationNames(stdout);
  if (migrations.length > 0) {
    return { status: 'pending', migrations, databaseMissing: false };
  }
  return { status: 'error', code, output: output.trim() };
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
  const lines = output.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    /have not yet been applied:/.test(line)
  );
  if (start === -1) {
    return [];
  }

  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) {
      break;
    }
    names.push(line.trim());
  }
  return names;
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
