import { Command } from 'commander';
import {
  disableModules,
  enableModules,
  findDependents,
  LoadedProject,
  loadProject,
  ModuleChangeResult,
  moduleNames,
  modules,
  parseModuleNames,
  resolveModules,
  ScaffoldError
} from '@appweaver/create-weaver-app/scaffold';
import { runProcess } from '../utils';

/**
 * Registers the `module` command, listing, adding and removing the optional modules of the project.
 *
 * @param {Command} program - The program to register the command on.
 */
export function moduleCommand(program: Command): void {
  const module = program
    .command('module')
    .alias('mod')
    .description(
      `Manage the optional modules of the project (${moduleNames.join(', ')}).`
    );

  module
    .command('list')
    .alias('ls')
    .description('List the modules and whether the project has them enabled.')
    .action(() => {
      const { enabled } = load();
      const rows = moduleNames.map((name) => [
        name,
        enabled.includes(name) ? 'enabled' : 'disabled',
        modules[name].packages.join(', ') || '-',
        modules[name].requires.join(', ') || '-',
        modules[name].description
      ]);
      printTable([
        ['Module', 'Status', 'Packages', 'Requires', 'Description'],
        ...rows
      ]);
    });

  module
    .command('add <modules...>')
    .description(
      'Add modules to the project: their packages, configuration and files, with the modules they require.'
    )
    .option(
      '-f, --force',
      'Overwrite the existing files instead of skipping them.'
    )
    .option('--dry-run', 'Print the changes without applying them.')
    .option('--no-install', 'Skip the installation of the dependencies.')
    .option('--verbose', 'Print verbose output.')
    .action(async (names: string[], _, command: Command) => {
      const project = load();
      const { modules: requested, required } = run(() =>
        resolveModules(parseModuleNames(names))
      );
      for (const [requirement, by] of required) {
        if (!project.enabled.includes(requirement)) {
          console.log(`Adding module ${requirement}, required by ${by}.`);
        }
      }

      const added = requested.filter((name) => !project.enabled.includes(name));
      for (const name of requested.filter((name) => !added.includes(name))) {
        console.log(`Module ${name} is already enabled.`);
      }
      if (added.length === 0) {
        return;
      }

      const result = enableModules(
        project.files,
        project.context,
        project.enabled,
        added,
        { force: !!command.getOptionValue('force') }
      );
      await applyChanges(
        project,
        result,
        command,
        `Added modules: ${added.join(', ')}`
      );
    });

  module
    .command('remove <modules...>')
    .alias('rm')
    .description(
      'Remove modules from the project: their packages, configuration and files, including the template, ' +
        'translation and Docker files.'
    )
    .option('--dry-run', 'Print the changes without applying them.')
    .option('--no-install', 'Skip the installation of the dependencies.')
    .option('--verbose', 'Print verbose output.')
    .action(async (names: string[], _, command: Command) => {
      const project = load();
      const requested = run(() => parseModuleNames(names));

      const removed = requested.filter((name) =>
        project.enabled.includes(name)
      );
      for (const name of requested.filter((name) => !removed.includes(name))) {
        console.log(`Module ${name} is not enabled.`);
      }
      if (removed.length === 0) {
        return;
      }

      const dependents = findDependents(removed, project.enabled);
      if (dependents.length > 0) {
        for (const [name, requirement] of dependents) {
          console.error(
            `Module ${name} requires ${requirement}, remove ${name} as well.`
          );
        }
        process.exit(1);
      }

      const result = disableModules(
        project.files,
        project.context,
        project.enabled,
        removed
      );
      await applyChanges(
        project,
        result,
        command,
        `Removed modules: ${removed.join(', ')}`
      );
    });
}

/** Loads the project of the working directory, exiting on an error. */
function load(): LoadedProject {
  return run(() => loadProject(process.cwd()));
}

/** Runs a function, printing a scaffold error and exiting instead of throwing it. */
function run<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ScaffoldError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}

/** Prints the changes of the project files, then commits them and installs the dependencies, unless a dry run. */
async function applyChanges(
  project: LoadedProject,
  result: ModuleChangeResult,
  command: Command,
  message: string
): Promise<void> {
  const dryRun = !!command.getOptionValue('dryRun');
  const install = command.getOptionValue('install');
  const quiet = !command.getOptionValue('verbose');

  const changes = project.files.changes();
  console.log(dryRun ? 'Changes that would be made:' : 'Changes:');
  printTable(changes.map(({ type, path }) => [`  ${type}`, path]));
  for (const warning of result.warnings) {
    console.warn(`  ${warning}`);
  }

  if (dryRun) {
    return;
  }

  await project.files.commit();

  if (result.packagesChanged && install) {
    console.log('\nInstalling dependencies...');
    const packageManager = project.context.runtime === 'bun' ? 'bun' : 'npm';
    const status = await runProcess(packageManager, ['install'], { quiet });
    if (status !== 0) {
      console.error(
        `Installing the dependencies failed, run "${packageManager} install" to retry. ` +
          'Use --verbose flag to see error details.'
      );
      process.exit(1);
    }
  }

  console.log(`\n${message}`);
}

function printTable(rows: string[][]): void {
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => row[column].length))
  );
  for (const row of rows) {
    console.log(
      row
        .map((cell, column) =>
          column < row.length - 1 ? cell.padEnd(widths[column]) : cell
        )
        .join('  ')
    );
  }
}
