import { Command } from 'commander';
import {
  databaseTypes,
  disableModules,
  enableModules,
  findDependents,
  LoadedProject,
  loadProject,
  ModuleChangeResult,
  moduleNames,
  modules,
  parseDatabaseType,
  parseModuleNames,
  resolveModules,
  ScaffoldError
} from '@appweaver/create/scaffold';
import { appConfig } from '@appweaver/common';
import { runProcess } from '../utils';
import { localModuleFiles, writeModuleFiles } from './local-module';
import { describePackageModule, isPackageName } from './package-module';

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
      `Manage the optional modules of the project (${moduleNames.join(', ')}), module packages and local modules.`
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
    .command('new <name>')
    .description(
      'Create a local module in <sourcePath>/modules/<name>/, enabled by app.modulesPattern.'
    )
    .option('--dry-run', 'Print the files without writing them.')
    .action((name: string, _, command: Command) => {
      let files: Record<string, string>;
      try {
        files = localModuleFiles(name, appConfig.SOURCE_PATH);
        if (!command.getOptionValue('dryRun')) {
          writeModuleFiles(process.cwd(), files);
        }
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
      console.log(
        command.getOptionValue('dryRun')
          ? 'Files that would be created:'
          : 'Created:'
      );
      Object.keys(files).forEach((file) => console.log(`  ${file}`));
    });

  module
    .command('add <modules...>')
    .description(
      'Add modules to the project: the optional modules with their packages, configuration and files and the ' +
        'modules they require, or any module package by its name (i.e. @acme/appweaver-gcs), installed without ' +
        'running its scripts.'
    )
    .option(
      '-f, --force',
      'Overwrite the existing files instead of skipping them.'
    )
    .option(
      '--database [database]',
      `Type of SQL database of the data module (${databaseTypes.join(', ')}). (default: sqlite)`,
      parseDatabaseType
    )
    .option('--dry-run', 'Print the changes without applying them.')
    .option('--no-install', 'Skip the installation of the dependencies.')
    .option('--verbose', 'Print verbose output.')
    .action(async (allNames: string[], _, command: Command) => {
      const project = load();
      const database = command.getOptionValue('database');
      if (database) {
        if (project.enabled.includes('data')) {
          console.error(
            `Module data is already enabled with the ${project.context.database} database.`
          );
          process.exit(1);
        }
        project.context.database = database;
      }
      const isPackage = (name: string) => isPackageName(name, moduleNames);
      const packageNames = allNames.filter(isPackage);
      if (packageNames.length > 0) {
        await addPackageModules(project, packageNames, command);
      }
      const names = allNames.filter((name) => !isPackage(name));
      const { modules: requested, required } = run(() =>
        resolveModules(parseModuleNames(names))
      );
      if (database && !requested.includes('data')) {
        console.log(
          'Ignoring --database, the data module it configures is not added.'
        );
      }
      if (requested.length === 0) {
        return;
      }

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

/** Installs module packages without running their scripts, then describes their modules. */
async function addPackageModules(
  project: LoadedProject,
  packageNames: string[],
  command: Command
): Promise<void> {
  const bun = project.context.runtime === 'bun';
  const install = command.getOptionValue('install');
  // Without the installation, only package.json and the lockfile are updated
  const args = bun
    ? ['add', ...(install ? [] : ['--lockfile-only']), ...packageNames]
    : [
        'install',
        '--ignore-scripts',
        ...(install ? [] : ['--package-lock-only']),
        ...packageNames
      ];
  const packageManager = bun ? 'bun' : 'npm';

  if (command.getOptionValue('dryRun')) {
    console.log(`Would run: ${packageManager} ${args.join(' ')}`);
    return;
  }

  const status = await runProcess(packageManager, args, {
    quiet: !command.getOptionValue('verbose')
  });
  if (status !== 0) {
    console.error(
      `Installing ${packageNames.join(', ')} failed. Use --verbose flag to see error details.`
    );
    process.exit(1);
  }
  if (!install) {
    console.log(
      `Added ${packageNames.join(', ')} to package.json, run "${packageManager} install" to enable the modules.`
    );
    return;
  }
  for (const name of packageNames) {
    describePackageModule(process.cwd(), name).forEach((line) =>
      console.log(line)
    );
  }
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
