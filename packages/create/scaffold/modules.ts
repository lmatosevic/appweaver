import { getDatabaseAdapter, getDatabaseUrl } from './database-config';
import {
  moduleNames,
  ModuleName,
  ProjectContext,
  ScaffoldError
} from './types';

/** A value of a JSON file, at a dotted path such as `config.redis.url`. */
export type ConfigEntry = [path: string, value: unknown];

/** The values a module sets in a JSON file of the project other than appweaver.json, skipped when it is missing. */
export type JsonFileEntries = {
  file: string;
  enabled: ConfigEntry[];
  disabled: ConfigEntry[];
};

/** An optional module a project is scaffolded with, or adds and removes later. */
export type ModuleDefinition = {
  name: ModuleName;
  description: string;
  /** The npm packages the module installs, marking it as enabled. */
  packages: string[];
  /** The modules it cannot run without. */
  requires: ModuleName[];
  /** The appweaver.json values set while the module is enabled. */
  enabledConfig: ConfigEntry[] | ((context: ProjectContext) => ConfigEntry[]);
  /** The appweaver.json values set while the module is disabled. */
  disabledConfig: ConfigEntry[];
  /** The npm packages it installs that depend on the project, i.e. the driver adapter of its database. */
  projectPackages?: (context: ProjectContext) => string[];
  /** The values of the other JSON files of the project, i.e. the scripts of package.json. */
  jsonFiles?: (context: ProjectContext) => JsonFileEntries[];
  /** The directories and generated files the module owns, deleted whatever their contents when it is removed. */
  directories?: string[];
  /** The file whose presence marks a module without packages as enabled. */
  marker?: string;
};

const bunE2eScript =
  'bun test ./test/e2e --reporter=junit --reporter-outfile=./reports/e2e.xml';

export const modules: Record<ModuleName, ModuleDefinition> = {
  data: {
    name: 'data',
    description:
      'Prisma database with the resources, the User auth model and the seeders, otherwise no database',
    packages: [
      '@appweaver/data',
      '@appweaver/sharp',
      '@prisma/client',
      'prisma'
    ],
    requires: [],
    enabledConfig: ({ database, name }) => [
      ['config.database.url', getDatabaseUrl(database, name, 'dev')],
      [
        'environments.test.database.url',
        getDatabaseUrl(database, name, 'test')
      ],
      [
        'environments.test.database.schemaPath',
        './temp/database/schema.prisma'
      ],
      [
        'environments.test.database.migrationsDirPath',
        './temp/database/migrations'
      ],
      [
        'environments.test.database.clientOutputDirPath',
        './temp/database/client'
      ],
      ['environments.test.storage.path', './temp/storage']
    ],
    disabledConfig: [],
    projectPackages: ({ database, runtime }) => [
      getDatabaseAdapter(database, runtime)
    ],
    jsonFiles: ({ runtime }) => [
      {
        file: 'package.json',
        enabled: [
          ['scripts.generate', 'weaver generate'],
          ['scripts.migrate', 'weaver migrate'],
          [
            'scripts.seed',
            runtime === 'bun' ? 'weaver seed' : 'weaver seed --build-project'
          ],
          // The test database is set up before the end-to-end tests, and torn down after them
          ...(runtime === 'bun'
            ? ([
                [
                  'scripts.e2e',
                  `${bunE2eScript} --preload ./test/e2e/support/preload.ts`
                ]
              ] as ConfigEntry[])
            : [])
        ],
        disabled: runtime === 'bun' ? [['scripts.e2e', bunE2eScript]] : []
      },
      {
        file: 'test/e2e/jest.e2e-config.json',
        enabled: [
          ['globalSetup', '<rootDir>/test/e2e/support/setup.ts'],
          ['globalTeardown', '<rootDir>/test/e2e/support/teardown.ts']
        ],
        disabled: []
      }
    ],
    directories: ['database', 'src/types/generated.ts']
  },
  web: {
    name: 'web',
    description:
      'Fastify HTTP server with the resource routes, authentication and Swagger, otherwise no server',
    packages: ['@appweaver/web'],
    requires: ['data'],
    enabledConfig: ({ host, port }) => [
      ['config.server.host', host],
      ['config.server.port', port],
      ['environments.test.server.listen', false]
    ],
    disabledConfig: []
  },
  redis: {
    name: 'redis',
    description:
      'Redis connection (IoRedis) for the cache, rate limit and queue, otherwise in memory',
    packages: ['@appweaver/redis'],
    requires: [],
    enabledConfig: [
      ['config.memory.redis.url', 'redis://${REDIS_HOST:-localhost}:6379/0'],
      ['environments.test.memory.provider', 'memory']
    ],
    disabledConfig: []
  },
  queue: {
    name: 'queue',
    description: 'BullMQ queue on Redis, otherwise the in-memory queue',
    packages: ['@appweaver/bullmq'],
    requires: ['redis'],
    enabledConfig: [['environments.test.queue.provider', 'memory']],
    disabledConfig: []
  },
  scheduler: {
    name: 'scheduler',
    description: 'Cron job scheduler, otherwise disabled',
    packages: ['@appweaver/cron'],
    requires: [],
    enabledConfig: [['environments.test.scheduler.autoStartJob', false]],
    disabledConfig: []
  },
  mailer: {
    name: 'mailer',
    description:
      'SMTP mailer (Nodemailer) of the account emails, otherwise disabled',
    packages: ['@appweaver/nodemailer'],
    requires: [],
    // The json mailer of the tests still needs a sender, the other environments set their own
    enabledConfig: [
      ['environments.test.mailer.provider', 'json'],
      ['environments.test.mailer.senderAddress', 'no-reply@example.com']
    ],
    disabledConfig: []
  },
  templates: {
    name: 'templates',
    description:
      'Handlebars templates in templates/, with the account email templates when the mailer is enabled',
    packages: ['@appweaver/handlebars'],
    requires: [],
    enabledConfig: [['environments.dev.template.cache', false]],
    disabledConfig: [],
    directories: ['templates']
  },
  locales: {
    name: 'locales',
    description:
      'Translation files in locales/, with the account email texts when the mailer is enabled, otherwise the English texts are written into the templates',
    packages: [],
    requires: [],
    enabledConfig: [],
    disabledConfig: [],
    directories: ['locales'],
    marker: 'locales'
  },
  docker: {
    name: 'docker',
    description:
      'Dockerfile, docker-compose.yml with the database and Redis services of the enabled modules, and start.sh',
    packages: [],
    requires: [],
    enabledConfig: [],
    disabledConfig: [],
    marker: 'Dockerfile'
  }
};

/** The appweaver.json values a module sets while enabled, in a project. */
export function moduleConfig(
  module: ModuleDefinition,
  context: ProjectContext
): ConfigEntry[] {
  return typeof module.enabledConfig === 'function'
    ? module.enabledConfig(context)
    : module.enabledConfig;
}

/**
 * Parses module names, given one per value or separated by commas.
 *
 * @param {string[]} values - The module names.
 * @return {ModuleName[]} The modules, in the order they are applied.
 * @throws {ScaffoldError} When a name is not a module.
 */
export function parseModuleNames(values: string[]): ModuleName[] {
  const names = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const unknown = names.filter(
    (name) => !moduleNames.includes(name as ModuleName)
  );
  if (unknown.length > 0) {
    throw new ScaffoldError(
      `Unknown module: ${unknown.join(', ')}. Must be one of following: ${moduleNames.join(', ')}.`
    );
  }

  return sortModules(names as ModuleName[]);
}

/** Sorts the modules in the order they are applied, without duplicates. */
export function sortModules(names: Iterable<ModuleName>): ModuleName[] {
  const set = new Set(names);
  return moduleNames.filter((name) => set.has(name));
}

/**
 * Adds the modules the selected ones require, leaving out the excluded ones.
 *
 * @param {ModuleName[]} selected - The selected modules.
 * @param {ModuleName[]} [excluded=[]] - The modules to leave out of the selection.
 * @return {{ modules: ModuleName[]; required: [ModuleName, ModuleName][] }} The modules in the order they are
 * applied, and every required module the selection did not contain, paired with a module requiring it.
 * @throws {ScaffoldError} When an excluded module is required by a selected one.
 */
export function resolveModules(
  selected: ModuleName[],
  excluded: ModuleName[] = []
): { modules: ModuleName[]; required: [ModuleName, ModuleName][] } {
  const result = new Set(selected.filter((name) => !excluded.includes(name)));
  const required: [ModuleName, ModuleName][] = [];

  const pending = [...result];
  while (pending.length > 0) {
    const name = pending.shift()!;
    for (const requirement of modules[name].requires) {
      if (excluded.includes(requirement)) {
        throw new ScaffoldError(
          `Module ${name} requires ${requirement}, exclude ${name} as well.`
        );
      }
      if (!result.has(requirement)) {
        result.add(requirement);
        required.push([requirement, name]);
        pending.push(requirement);
      }
    }
  }

  return { modules: sortModules(result), required };
}

/**
 * Finds the modules that stay enabled while requiring one of the removed modules.
 *
 * @param {ModuleName[]} removed - The modules to remove.
 * @param {ModuleName[]} enabled - The enabled modules.
 * @return {[ModuleName, ModuleName][]} Every remaining module paired with a removed module it requires.
 */
export function findDependents(
  removed: ModuleName[],
  enabled: ModuleName[]
): [ModuleName, ModuleName][] {
  const dependents: [ModuleName, ModuleName][] = [];
  for (const name of enabled) {
    if (removed.includes(name)) {
      continue;
    }
    for (const requirement of modules[name].requires) {
      if (removed.includes(requirement)) {
        dependents.push([name, requirement]);
      }
    }
  }
  return dependents;
}
