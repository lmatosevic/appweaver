import path from 'node:path';
import { Command } from 'commander';
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
    .description('Apply the pending database migrations.')
    .option(
      '--dry-run',
      'Print the pending migrations and their SQL without applying them.'
    )
    .action(async (_, command: Command) => {
      if (command.getOptionValue('dryRun')) {
        process.exit(await printMigrationPlan());
      }
      process.exit(await runProcess('prisma', ['migrate', 'deploy']));
    });
}

/**
 * Prints the migrations `prisma migrate deploy` would apply, with their SQL, without changing the database.
 *
 * @return {Promise<number>} The exit code: `0`, or the code of `prisma migrate status` when it fails, i.e. on a failed
 * migration or an unreachable database.
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
    console.log('No pending migrations, the database schema is up to date.');
    return 0;
  }

  const count = plan.migrations.length;
  const plural = count === 1 ? 'migration' : 'migrations';
  console.log(
    plan.databaseMissing
      ? `The database does not exist yet, ${count} ${plural} would be applied:`
      : `${count} pending ${plural} would be applied:`
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
