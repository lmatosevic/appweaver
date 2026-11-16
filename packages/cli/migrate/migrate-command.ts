import path from 'node:path';
import { Command } from 'commander';
import {
  configOverrides,
  DatabaseType,
  resolveDatabaseType
} from '@appweaver/common';
import { importPackage, runProcess } from '../utils';
import { planMigrations, readMigrations } from './plan-migrations';

/**
 * Registers the `migrate` command, applying the pending database migrations.
 *
 * @param {Command} program - The program to register the command on.
 */
export function migrateCommand(program: Command): void {
  program
    .command('migrate')
    .alias('mge')
    .description(
      'Apply the pending database migrations, then set up the hypertables and the geometry triggers of the models.'
    )
    .option(
      '--no-setup',
      'Skip the setup of the hypertables and the geometry triggers, left to the application start.'
    )
    .option(
      '--dry-run',
      'Print the pending migrations and their SQL without applying them.'
    )
    .action(async (_, command: Command) => {
      if (command.getOptionValue('dryRun')) {
        process.exit(await printMigrationPlan());
      }
      const code = await runProcess('prisma', ['migrate', 'deploy']);
      if (code !== 0 || !command.getOptionValue('setup')) {
        process.exit(code);
      }
      process.exit(await runDatabaseSetup());
    });
}

/**
 * Sets up the parts of the database the migrations do not hold (the hypertables of the `timescale` time series and the
 * geometry triggers of the `postgis` spatial provider) with the migration URL, so the user of the application needs
 * no privilege to change the schema. Only PostgreSQL has such parts, so any other database is skipped without loading
 * the application.
 *
 * @return {Promise<number>} The exit code: `0`, or `1` when the setup fails.
 */
export async function runDatabaseSetup(): Promise<number> {
  const { databaseConfig, migrationUrl } = await importPackage<
    typeof import('@appweaver/data/config')
  >('@appweaver/data/config', 'migrate');
  try {
    const url = migrationUrl();
    if (
      resolveDatabaseType(databaseConfig.TYPE, url) !== DatabaseType.PostgreSQL
    ) {
      return 0;
    }
    // The application connects with the migration URL, for the setup only
    configOverrides.DATABASE_URL = url;

    const { setupDatabase } = await importPackage<
      typeof import('@appweaver/data/internal')
    >('@appweaver/data/internal', 'migrate');
    const { scanPath, built, parts } = await setupDatabase();
    if (!built) {
      console.warn(
        `The models are not built in ${path.relative(process.cwd(), scanPath)}, so the hypertables and the ` +
          'geometry triggers were not set up, build the project and run weaver migrate again.'
      );
    } else if (parts.length > 0) {
      console.log(`Set up the ${parts.join(' and ')}.`);
    }
    return 0;
  } catch (error) {
    console.error(`The database setup failed: ${(error as Error).message}`);
    return 1;
  }
}

/**
 * Prints the migrations `prisma migrate deploy` would apply, with their SQL, without changing the database.
 *
 * @return {Promise<number>} The exit code: `0`, or the code of `prisma migrate status` when the migrations cannot be
 * applied, i.e. on a failed migration or an unreachable database.
 */
export async function printMigrationPlan(): Promise<number> {
  const { databaseConfig } = await importPackage<
    typeof import('@appweaver/data/config')
  >('@appweaver/data/config', 'migrate');
  const migrationsDir = path.resolve(databaseConfig.MIGRATIONS_DIR_PATH);

  const plan = await planMigrations(migrationsDir);
  if (plan.status === 'error') {
    console.error(plan.output);
    return plan.code;
  }
  if (plan.status === 'up-to-date' || plan.migrations.length === 0) {
    console.log('No pending migrations.');
    return 0;
  }

  const count = plan.migrations.length;
  const pending = `${count} pending migration${count === 1 ? '' : 's'}`;
  console.log(
    {
      missing: `The database does not exist yet, ${pending} would be applied:`,
      // Prisma refuses to migrate a database with tables it has no history of (P3005)
      unmanaged: `The database has no migration history, ${pending} would be applied if it has no tables:`,
      managed: `${pending} would be applied:`
    }[plan.database]
  );

  for (const { name, sql } of await readMigrations(
    migrationsDir,
    plan.migrations
  )) {
    console.log(`\n-- Migration ${name}`);
    console.log(sql?.trim() ?? '-- migration.sql not found');
  }

  console.log('\nDry run, the database was not changed.');
  return 0;
}
