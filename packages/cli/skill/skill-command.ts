import { Command } from 'commander';
import { syncProjectSkill } from './sync-skill';

/**
 * Registers the `skill` command, managing the AI agent skill files of the project.
 *
 * @param {Command} program - The program to register the command on.
 */
export function skillCommand(program: Command): void {
  const skill = program
    .command('skill')
    .description('Manage the AI agent skill files of the project.');

  skill
    .command('sync')
    .description(
      'Copy the skill files of the installed @appweaver/skill into the agent directories (i.e. .claude, .agents) of the project.'
    )
    .option(
      '--dry-run',
      'Print the skill directories that would be written without writing them.'
    )
    .action(async (_, command: Command) => {
      const synced = await syncProjectSkill(process.cwd(), {
        dryRun: !!command.getOptionValue('dryRun')
      });
      if (!synced) {
        process.exit(1);
      }
    });
}
