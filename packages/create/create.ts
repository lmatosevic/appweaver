#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Command, InvalidOptionArgumentError } from 'commander';
import {
  createModulePackage,
  createProject,
  ModuleContract,
  moduleContracts,
  DatabaseType,
  databaseTypes,
  ModuleName,
  moduleNames,
  parseModuleNames,
  resolveModules,
  ScaffoldError
} from './scaffold';

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, './package.json'), 'utf8')
);

const agentTypes = [
  'claude',
  'codex',
  'junie',
  'cursor',
  'copilot',
  'opencode',
  'kiro',
  'pi',
  'none'
];

// `create-appweaver module <package>` creates a module package instead of a project
if (process.argv[2] === 'module') {
  createModuleProgram().parse(process.argv.toSpliced(2, 1));
} else {
  createProjectProgram().parse();
}

/** The program creating a module package. */
function createModuleProgram(): Command {
  return new Command()
    .name('create-appweaver module')
    .description(
      'Create an Appweaver module package, run as npm create @appweaver module <package>'
    )
    .helpOption('-h, --help', 'Output usage information.')
    .argument('<package>', 'npm name of the package, i.e. @acme/appweaver-gcs')
    .argument('[description]', 'Description of the package', 'Appweaver module')
    .option(
      '--contract [contract]',
      `Contract the driver of the module implements (${moduleContracts.join(', ')}), none for a feature module.`,
      parseContract,
      'none'
    )
    .option(
      '-o, --output-dir [outputDir]',
      'Directory where to create the package. (default: name of the package)'
    )
    .action(async (packageName: string, description: string, _, command) => {
      const dir = path.resolve(
        command.getOptionValue('outputDir') ??
          packageName.replace(/^@[^/]+\//, '')
      );
      try {
        const files = await createModulePackage({
          dir,
          packageName,
          description,
          contract: command.getOptionValue('contract')
        });
        console.log(
          `Created module package in ${path.relative(process.cwd(), dir) || '.'}:`
        );
        files.forEach((file) => console.log(`  ${file}`));
        console.log('\nNext: npm install, npm test, then npm publish');
      } catch (e) {
        if (e instanceof ScaffoldError) {
          command.error(`error: ${e.message}`);
        }
        throw e;
      }
    });
}

function parseContract(value: string): ModuleContract {
  if (!moduleContracts.includes(value as ModuleContract)) {
    throw new InvalidOptionArgumentError(
      `Must be one of: ${moduleContracts.join(', ')}.`
    );
  }
  return value as ModuleContract;
}

/** The program creating a project. */
function createProjectProgram(): Command {
  const program = new Command();

  program
    .name('create-appweaver')
    .description('Create a new Appweaver project, run as npm create @appweaver')
    .version(pkg.version, '-v, --version', 'Output the current version.')
    .helpOption('-h, --help', 'Output usage information.')
    .usage('<name> [description] [options]')
    .argument('<name>', 'Name of the new project')
    .argument(
      '[description]',
      'Description of the new project',
      'Appweaver project'
    )
    .option(
      '-o, --output-dir [outputDir]',
      'Directory where to generate new project. (default: name of project)'
    )
    .option(
      '--database [database]',
      `Type of SQL database (${databaseTypes.join(', ')}).`,
      parseDatabaseType,
      'sqlite'
    )
    .option(
      '--port [port]',
      'Port number where the application server will listen.',
      parsePortNumber,
      5000
    )
    .option(
      '--host [host]',
      'Hostname or IP address where the application server will bind.',
      parseHostname,
      '0.0.0.0'
    )
    .option(
      '--agent [agent]',
      `The AI agent for which to configure guidelines and skill files (${agentTypes.join(', ')}).`,
      parseAgentType,
      'claude'
    )
    .option(
      '--add <modules...>',
      `Modules to add, separated by spaces or commas (${moduleNames.join(', ')}).`
    )
    .option('--all', 'Add every module.')
    .option(
      '--exclude <modules...>',
      'Modules to leave out of --all, separated by spaces or commas.'
    )
    .option('--bun', 'Use Bun as application runtime.')
    .option('--no-install', 'Skip all dependencies installation.');

  program.action((name: string, description: string, _, command: Command) => {
    // Validated before anything is created, reported as an invalid option
    let selectedModules: ModuleName[];
    try {
      selectedModules = selectModules(command);
    } catch (e) {
      if (e instanceof ScaffoldError) {
        command.error(`error: ${e.message}`);
      }
      throw e;
    }

    return createApp(name, description, command, selectedModules);
  });

  return program;
}

/** Creates the project with the selected modules, its agent files, and installs its dependencies. */
async function createApp(
  name: string,
  description: string,
  command: Command,
  selectedModules: ModuleName[]
): Promise<void> {
  const directory = command.getOptionValue('outputDir');
  const runtime = command.getOptionValue('bun') ? 'bun' : 'node';
  const packageManager = runtime === 'bun' ? 'bun' : 'npm';

  // Check if bun runtime is installed on this machine
  if (runtime === 'bun') {
    const status = await runProcess('bun', ['--version'], { quiet: true });
    if (status !== 0) {
      console.error('Bun runtime is not installed on this machine.');
      process.exit(1);
    }
  }

  // Sanitize and create a new directory
  const sanitizedName = name
    .replace(/\s+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

  const projectDir = directory ?? sanitizedName;
  const destDir = path.join(process.cwd(), projectDir);

  // Initialize new project directory
  try {
    await fsp.access(destDir, fs.constants.F_OK);
    console.log(`Using existing directory: ${path.dirname(destDir)}\n`);
  } catch (e) {
    await fsp.mkdir(destDir, { recursive: true });
    console.log(`Created new directory: ${projectDir}\n`);
  }

  console.log(
    `Generating application files${
      selectedModules.length > 0
        ? ` with modules: ${selectedModules.join(', ')}`
        : ''
    }...`
  );

  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  const { warnings } = await createProject({
    dir: destDir,
    name,
    packageName: sanitizedName,
    description,
    host: command.getOptionValue('host'),
    port: command.getOptionValue('port'),
    runtime,
    database: command.getOptionValue('database'),
    modules: selectedModules
  });
  for (const warning of warnings) {
    console.log(`  ${warning}`);
  }

  // Add instructions for AI Agents and skill files
  const agent = command.getOptionValue('agent');
  if (agent !== 'none') {
    let agentsDir: string;
    if (['claude', 'junie', 'kiro', 'pi', 'opencode'].includes(agent)) {
      agentsDir = `.${agent}`;
    } else if (agent === 'copilot') {
      agentsDir = '.github';
    } else {
      agentsDir = '.agents';
    }

    const guidelinesFileName = agent === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';

    // Copy skill and referenced files. The framework guidelines
    // (GUIDELINES.md) are preserved inside the skills directory so that
    // `weaver upgrade` can keep them in sync without touching the project's
    // own root guidelines file.
    const skillDir = path.join(__dirname, 'skill');
    const projectSkillPath = path.join(agentsDir, 'skills', 'appweaver');
    const projectSkillDir = path.join(destDir, projectSkillPath);
    await fsp.cp(skillDir, projectSkillDir, {
      recursive: true
    });

    // Create a thin root guidelines file that references the framework
    // guidelines from the skills directory. This file is never overwritten
    // by `weaver upgrade`, so it can be freely extended in the project.
    const guidelinesPath = path
      .join(projectSkillPath, 'GUIDELINES.md')
      .replace(/\\/g, '/');
    const guidelinesFilePath = path.join(destDir, guidelinesFileName);
    const guidelinesReference =
      agent === 'claude'
        ? `@${guidelinesPath}`
        : `[Appweaver framework guidelines](${guidelinesPath})`;
    const guidelinesContent =
      `# ${displayName}\n\n` +
      `${description}\n\n` +
      `This is an [Appweaver](https://github.com/lmatosevic/appweaver) ` +
      `project. Follow the framework conventions, architecture,\n and ` +
      `usage documented in the guidelines:\n\n${guidelinesReference}\n\n` +
      `<!-- Add your own project-specific instructions below this line. -->\n`;
    await fsp.writeFile(guidelinesFilePath, guidelinesContent, {
      encoding: 'utf8'
    });
  }

  console.log(`Done\n`);

  if (!command.getOptionValue('install')) {
    console.log(`${name} created successfully!`);
    return;
  }

  console.log(`Installing dependencies...`);

  await runProcess(
    packageManager,
    ['install', '--no-audit', '--no-fund', '--loglevel=error'],
    { destDir }
  );

  console.log(`Done\n`);

  console.log(`Configuring application...`);

  await runProcess(packageManager, ['run', 'generate'], { destDir });

  console.log(`Done\n`);

  console.log(`${name} created successfully!`);
}

/**
 * Selects the modules of `--all` or `--add` with the modules they require, leaving out the `--exclude` ones.
 *
 * @throws {ScaffoldError} When a module is unknown, both added and excluded, or required by an added module.
 */
function selectModules(command: Command): ModuleName[] {
  const excluded = parseModuleNames(command.getOptionValue('exclude') ?? []);
  const added = parseModuleNames(command.getOptionValue('add') ?? []);

  const conflicts = added.filter((name) => excluded.includes(name));
  if (conflicts.length > 0) {
    throw new ScaffoldError(
      `Module ${conflicts.join(', ')} cannot be both added and excluded.`
    );
  }

  const selected = command.getOptionValue('all') ? [...moduleNames] : added;
  const { modules: resolved, required } = resolveModules(selected, excluded);
  for (const [requirement, by] of required) {
    console.log(`Adding module ${requirement}, required by ${by}.`);
  }
  return resolved;
}

function runProcess(
  cmd: string,
  args: string[] = [],
  params: { destDir?: string; quiet?: boolean } = {}
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const { destDir, quiet } = params;
    const command = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd;
    const child = spawn(command, {
      stdio: quiet ? 'ignore' : 'inherit',
      shell: true,
      cwd: destDir
    });

    child.on('error', reject);

    child.on('close', (code) => {
      resolve(code);
    });
  });
}

function parseDatabaseType(value: string): DatabaseType {
  const lowerDbType = value.toLowerCase() as DatabaseType;
  if (!databaseTypes.includes(lowerDbType)) {
    throw new InvalidOptionArgumentError(
      `Must be one of following: ${databaseTypes.join(', ')}.`
    );
  }

  return lowerDbType;
}

function parsePortNumber(value: string): number {
  const int = parseInt(value, 10);
  if (isNaN(int) || int < 0 || int > 65535) {
    throw new InvalidOptionArgumentError(
      'Must be an integer between 0 and 65535.'
    );
  }

  return int;
}

function parseHostname(value: string): string {
  try {
    new URL(`http://${value}`);
  } catch {
    throw new InvalidOptionArgumentError(
      'Must be a valid hostname or IP address.'
    );
  }

  return value;
}

function parseAgentType(value: string): string {
  const lowerAgentType = value.toLowerCase();
  if (!agentTypes.includes(lowerAgentType)) {
    throw new InvalidOptionArgumentError(
      `Must be one of following: ${agentTypes.join(', ')}.`
    );
  }

  return lowerAgentType;
}
