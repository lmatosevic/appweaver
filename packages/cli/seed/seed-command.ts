import { Command } from 'commander';
import { runProcess } from '../utils';

export function seedCommand(program: Command): void {
  program
    .command('seed')
    .description('Seed the database')
    .action(async () => {
      await runProcess('ts-node', [
        '-r tsconfig-paths/register',
        './database/seeder/index.ts'
      ]);
    });
}
