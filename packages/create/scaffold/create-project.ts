import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  enableModules,
  initializeModules,
  ModuleChangeResult
} from './apply-modules';
import {
  getDatabaseAdapter,
  getDatabaseUrl,
  getSecretsEnv,
  getSqliteGitignore
} from './database-config';
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
  host: string;
  port: number;
  runtime: Runtime;
  database: DatabaseType;
  /** The modules to add, including the modules they require. */
  modules: ModuleName[];
};

/**
 * Creates a project from the base template, adding the modules the way `weaver module add` adds them to an
 * existing project.
 *
 * @param {CreateProjectOptions} options - The properties and modules of the project.
 * @return {Promise<ModuleChangeResult>} The outcome of adding the modules.
 */
export async function createProject(
  options: CreateProjectOptions
): Promise<ModuleChangeResult> {
  const { dir, packageName, runtime, database } = options;
  const files = new ProjectFiles(dir);

  const variables: Record<string, string> = {
    NAME: options.name.charAt(0).toUpperCase() + options.name.slice(1),
    LOWER_NAME: packageName,
    DESCRIPTION: options.description,
    HOST: options.host,
    PORT: String(options.port),
    DEPENDENCIES: formatDependencies([
      getDatabaseAdapter(database, runtime),
      '@prisma/client',
      // TypeBox defines the custom route and model schemas, at the version the
      // framework is built with
      '@sinclair/typebox',
      'prisma'
    ]),
    DEV_DEPENDENCIES: formatDependencies(getDevDependencies(runtime)),
    DATABASE_URL: getDatabaseUrl(database, packageName, 'dev'),
    DATABASE_TEST_URL: getDatabaseUrl(database, packageName, 'test'),
    SECRETS_ENV: getSecretsEnv(database, packageName),
    SQLITE_GITIGNORE: getSqliteGitignore(database),
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

  // Create the SQLite database directory (matches the "data/" DATABASE_URL),
  // kept in git by an empty file since the database files are ignored
  if (database === 'sqlite') {
    files.write('data/.gitkeep', '');
  }

  const context: ProjectContext = {
    name: packageName,
    port: options.port,
    runtime,
    database
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
