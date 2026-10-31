import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  enableModules,
  initializeModules,
  ModuleChangeResult
} from './apply-modules';
import { frameworkVersion, packageVersion } from './package-versions';
import { ProjectFiles } from './project-files';
import {
  collectTemplateFiles,
  readTemplateFile,
  templatesDir
} from './template-files';
import { DatabaseType, ModuleName, ProjectContext, Runtime } from './types';

export type CreateProjectOptions = {
  /** The directory the project is created in. */
  dir: string;
  /** The display name of the project. */
  name: string;
  /** The package name of the project, naming its containers. */
  packageName: string;
  description: string;
  /** The port of the server, when the web module is added. */
  port: number;
  runtime: Runtime;
  /** The database, when the data module is added. */
  database: DatabaseType;
  /** The host of the server, when the web module is added. Default: `'0.0.0.0'`. */
  host?: string;
  /** The modules to add, including the modules they require. */
  modules: ModuleName[];
};

/**
 * Creates a project from the base template, the application of the core module, adding the modules the way
 * `weaver module add` adds them to an existing project.
 *
 * @param {CreateProjectOptions} options - The properties and modules of the project.
 * @param {ProjectFiles} [files] - The files the project is written with, by default the ones of its directory.
 * @return {Promise<ModuleChangeResult>} The outcome of adding the modules.
 */
export async function createProject(
  options: CreateProjectOptions,
  files: ProjectFiles = new ProjectFiles(options.dir)
): Promise<ModuleChangeResult> {
  const { dir, packageName, runtime } = options;

  const variables: Record<string, string> = {
    NAME: options.name.charAt(0).toUpperCase() + options.name.slice(1),
    LOWER_NAME: packageName,
    DESCRIPTION: options.description,
    // TypeBox defines the config sections and the custom schemas, at the
    // version the framework is built with
    DEPENDENCIES: formatDependencies(['@sinclair/typebox']),
    DEV_DEPENDENCIES: formatDependencies(getDevDependencies(runtime)),
    VERSION: frameworkVersion
  };

  for (const file of collectTemplateFiles(
    path.join(templatesDir, 'base'),
    runtime
  )) {
    files.write(file.path, readTemplateFile(file, variables));
  }

  // Keep a copy of the ignored .env file in git, for setting up a clone
  files.write('.env.example', files.read('.env')!);

  const context: ProjectContext = {
    name: packageName,
    host: options.host,
    port: options.port,
    runtime,
    database: options.database
  };
  initializeModules(files);
  const result = enableModules(files, context, [], options.modules);

  await files.commit();

  // Create test reports directory
  await fsp.mkdir(path.join(dir, 'reports'), { recursive: true });

  return result;
}

function getDevDependencies(runtime: Runtime): string[] {
  const devDependencies = [
    '@eslint/js',
    '@types/node',
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    'eslint',
    'eslint-config-prettier',
    'eslint-plugin-prettier',
    'globals',
    'prettier',
    'typescript',
    'typescript-eslint'
  ];

  // Bun runs the tests itself, Node runs them with Jest
  if (runtime === 'bun') {
    devDependencies.push('@types/bun');
  } else {
    devDependencies.push(
      '@swc/core',
      '@swc/jest',
      '@types/jest',
      'eslint-plugin-jest',
      'jest',
      'jest-junit'
    );
  }

  return devDependencies;
}

/** Formats the packages as the sorted entries of a `package.json` dependencies object. */
function formatDependencies(names: string[]): string {
  return [...names]
    .sort()
    .map((name) => `    "${name}": "${packageVersion(name)}"`)
    .join(',\n');
}
