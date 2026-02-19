import { Command } from 'commander';
import { runProcess } from '../utils';

export function seedCommand(program: Command): void {
  program
    .command('seed')
    .description('Seed the database')
    .action(async () => {
      await runProcess('node', ['./dist/database/seeder/index.js']);
    });
}
