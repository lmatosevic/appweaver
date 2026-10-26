import fs from 'node:fs';
import path from 'node:path';
import {
  flattenTranslations,
  inlineTranslations
} from '../utils/translation-util';
import {
  addDatabaseServices,
  addRedisService,
  addServerPort,
  removeDatabaseServices,
  removeRedisService,
  removeServerPort
} from './compose-util';
import { getSecretsEnv, getSqliteGitignore } from './database-config';
import {
  addDockerfileBlock,
  DockerfileBlock,
  removeDockerfileBlock
} from './dockerfile-util';
import {
  ConfigEntry,
  moduleConfig,
  ModuleDefinition,
  modules,
  sortModules
} from './modules';
import { packageVersion } from './package-versions';
import { ProjectFiles } from './project-files';
import {
  collectTemplateFiles,
  readTemplateFile,
  TemplateFile,
  templatesDir
} from './template-files';
import { ModuleName, ProjectContext, Runtime } from './types';

/** The outcome of adding or removing modules. */
export type ModuleChangeResult = {
  /** Whether the dependencies of package.json changed, so they need to be installed. */
  packagesChanged: boolean;
  /** The changes that could not be made, to be made by hand. */
  warnings: string[];
};

export type EnableModulesOptions = {
  /** Overwrite the files that already exist instead of skipping them. */
  force?: boolean;
};

/** The state of a module change, passed to the integrations. */
type ModuleScaffold = {
  files: ProjectFiles;
  context: ProjectContext;
  /** The enabled modules, updated as each module is added or removed. */
  enabled: Set<ModuleName>;
  force: boolean;
  warnings: string[];
};

/**
 * What a module adds to a project when another module is enabled too, with the files of the
 * `templates/modules/<first>+<second>` directory.
 */
type ModuleIntegration = {
  modules: [ModuleName, ModuleName];
  /** Called with the module whose addition enables both. */
  enable?(scaffold: ModuleScaffold, name: ModuleName): void;
  /** Called with the module whose removal disables both. */
  disable?(scaffold: ModuleScaffold, name: ModuleName): void;
};

/**
 * What a module changes in the files of the base project, beside its own files and JSON values, reverted when it is
 * removed.
 */
type ModuleEdit = {
  enable(scaffold: ModuleScaffold): void;
  disable(scaffold: ModuleScaffold): void;
};

const publicBlock: DockerfileBlock = {
  comment: 'Copy public static files',
  instructions: ['COPY --from=build /usr/app/public /usr/app/public'],
  before: [
    'Copy templates',
    'Copy translation files',
    'Copy Prisma config',
    'Copy config file/s'
  ]
};

const templatesBlock: DockerfileBlock = {
  comment: 'Copy templates',
  instructions: ['COPY --from=build /usr/app/templates /usr/app/templates'],
  before: ['Copy translation files', 'Copy Prisma config', 'Copy config file/s']
};

const localesBlock: DockerfileBlock = {
  comment: 'Copy translation files',
  instructions: ['COPY --from=build /usr/app/locales /usr/app/locales'],
  before: ['Copy Prisma config', 'Copy config file/s']
};

const prismaBlock: DockerfileBlock = {
  comment: 'Copy Prisma config, database migrations, and schema file',
  instructions: [
    'COPY --from=build /usr/app/prisma.config.ts /usr/app/prisma.config.ts',
    'COPY --from=build /usr/app/database/migrations /usr/app/database/migrations',
    'COPY --from=build /usr/app/database/schema.prisma /usr/app/database/schema.prisma'
  ],
  before: ['Copy config file/s']
};

/** The start.sh anchor the container roles are inserted before. */
const unknownRole = 'else\n  echo "Could not match the container role';

const translationFile = 'locales/en.json';

const moduleEdits: Partial<Record<ModuleName, ModuleEdit>> = {
  // The database password referenced by the appweaver.json URL, and the ignored SQLite database files
  data: {
    enable: (scaffold) => {
      const { database, name } = scaffold.context;
      for (const file of ['.env', '.env.example']) {
        addText(scaffold, file, getSecretsEnv(database, name));
      }
      addText(scaffold, '.gitignore', getSqliteGitignore(database), '# OS');
    },
    disable: (scaffold) => {
      const { database, name } = scaffold.context;
      for (const file of ['.env', '.env.example']) {
        removeText(scaffold, file, getSecretsEnv(database, name));
      }
      removeText(scaffold, '.gitignore', getSqliteGitignore(database));
    }
  }
};

const integrations: ModuleIntegration[] = [
  {
    modules: ['data', 'docker'],
    enable: (scaffold) => {
      editFile(scaffold, 'docker-compose.yml', (content) =>
        addDatabaseServices(content, scaffold.context)
      );
      addBlock(scaffold, prismaBlock);
      addText(
        scaffold,
        'start.sh',
        getDatabaseRoles(scaffold.context.runtime),
        unknownRole
      );
    },
    disable: (scaffold) => {
      editFile(scaffold, 'docker-compose.yml', (content) =>
        removeDatabaseServices(content, scaffold.context)
      );
      removeBlock(scaffold, prismaBlock);
      removeText(
        scaffold,
        'start.sh',
        getDatabaseRoles(scaffold.context.runtime)
      );
    }
  },
  {
    modules: ['web', 'docker'],
    enable: (scaffold) => {
      editFile(scaffold, 'docker-compose.yml', (content) =>
        addServerPort(content, scaffold.context)
      );
      addBlock(scaffold, publicBlock);
    },
    disable: (scaffold) => {
      editFile(scaffold, 'docker-compose.yml', (content) =>
        removeServerPort(content, scaffold.context)
      );
      removeBlock(scaffold, publicBlock);
    }
  },
  {
    modules: ['redis', 'docker'],
    enable: (scaffold) =>
      editFile(scaffold, 'docker-compose.yml', (content) =>
        addRedisService(content, scaffold.context.name)
      ),
    disable: (scaffold) =>
      editFile(scaffold, 'docker-compose.yml', (content) =>
        removeRedisService(content, scaffold.context.name)
      )
  },
  // The account email templates, copied by the generic file handling, replace the placeholder of the empty directory
  {
    modules: ['mailer', 'templates'],
    enable: (scaffold) => scaffold.files.remove('templates/.gitkeep'),
    disable: (scaffold, name) => {
      if (name !== 'mailer') {
        return;
      }
      const emails = collectModuleFiles(
        'mailer+templates',
        scaffold.context
      ).map((file) => file.path);
      if (
        scaffold.files.list('templates').every((file) => emails.includes(file))
      ) {
        copyFiles(scaffold, 'templates');
      }
    }
  },
  // The English texts of the account emails, in the translation file of the project
  {
    modules: ['mailer', 'locales'],
    enable: (scaffold) => {
      const translations = scaffold.files.readJson(translationFile) ?? {};
      addTranslations(translations, readSourceTranslations(), scaffold.force);
      scaffold.files.writeJson(translationFile, translations);
    },
    // Removing the locales deletes the whole file
    disable: (scaffold, name) => {
      const translations = scaffold.files.readJson(translationFile);
      if (name !== 'mailer' || !translations) {
        return;
      }
      removeTranslations(translations, readSourceTranslations());
      scaffold.files.writeJson(translationFile, translations);
    }
  },
  {
    modules: ['templates', 'locales'],
    // The scaffolded templates still holding the English texts get the `t` calls back
    enable: (scaffold) => {
      const translations = loadSourceTranslations();
      for (const file of collectScaffoldedTemplates(scaffold)) {
        const source = fs.readFileSync(file.source, 'utf8');
        if (
          scaffold.files.read(file.path) ===
          inlineTemplate(file.path, source, translations)
        ) {
          scaffold.files.write(file.path, source);
        }
      }
    },
    // Every template keeps rendering the English texts of the translation file it loses
    disable: (scaffold, name) => {
      if (name !== 'locales') {
        return;
      }
      const translations = flattenTranslations(
        scaffold.files.readJson(translationFile) ?? {}
      );
      for (const file of scaffold.files.list('templates')) {
        const content = scaffold.files.read(file);
        if (!file.endsWith('.hbs') || content === undefined) {
          continue;
        }
        try {
          scaffold.files.write(
            file,
            inlineTemplate(file, content, translations)
          );
        } catch (e) {
          scaffold.warnings.push(
            `Unable to write the English texts into ${file}: ${(e as Error).message}`
          );
        }
      }
    }
  },
  {
    modules: ['templates', 'docker'],
    enable: (scaffold) => addBlock(scaffold, templatesBlock),
    disable: (scaffold) => removeBlock(scaffold, templatesBlock)
  },
  {
    modules: ['locales', 'docker'],
    enable: (scaffold) => addBlock(scaffold, localesBlock),
    disable: (scaffold) => removeBlock(scaffold, localesBlock)
  }
];

/**
 * Sets the appweaver.json values of every disabled module, which a project without any module starts with.
 *
 * @param {ProjectFiles} files - The project files.
 */
export function initializeModules(files: ProjectFiles): void {
  const config = files.readJson('appweaver.json') ?? {};
  for (const module of Object.values(modules)) {
    for (const [key, value] of module.disabledConfig) {
      setValue(config, key, value);
    }
  }
  files.writeJson('appweaver.json', config);
}

/**
 * Adds modules to a project: their packages, appweaver.json values and files, and what they add to the other
 * enabled modules. The modules are added in the order they are applied, and the files that already exist are
 * skipped. The changes are staged in the project files, until they are committed.
 *
 * @param {ProjectFiles} files - The project files.
 * @param {ProjectContext} context - The properties of the project.
 * @param {ModuleName[]} enabled - The modules the project has enabled.
 * @param {ModuleName[]} added - The modules to add, including the modules they require.
 * @param {EnableModulesOptions} [options={}] - The options of the change.
 * @return {ModuleChangeResult} The outcome of the change.
 */
export function enableModules(
  files: ProjectFiles,
  context: ProjectContext,
  enabled: ModuleName[],
  added: ModuleName[],
  options: EnableModulesOptions = {}
): ModuleChangeResult {
  const scaffold: ModuleScaffold = {
    files,
    context,
    enabled: new Set(enabled),
    force: !!options.force,
    warnings: []
  };
  const packages = files.read('package.json');

  for (const name of sortModules(added)) {
    if (scaffold.enabled.has(name)) {
      continue;
    }
    scaffold.enabled.add(name);

    const module = modules[name];
    updateModuleValues(files, context, module, true);
    updateDependencies(files, modulePackages(module, context), []);
    moduleEdits[name]?.enable(scaffold);
    copyFiles(scaffold, name);

    for (const integration of integrations) {
      if (isIntegrationOf(integration, name, scaffold.enabled)) {
        copyFiles(scaffold, integration.modules.join('+'));
        integration.enable?.(scaffold, name);
      }
    }
  }

  return {
    packagesChanged: files.read('package.json') !== packages,
    warnings: scaffold.warnings
  };
}

/**
 * Removes modules from a project: their packages, appweaver.json values and files, with what they added to the
 * other enabled modules, in the reverse order they are applied. The changes are staged in the project files, until
 * they are committed.
 *
 * @param {ProjectFiles} files - The project files.
 * @param {ProjectContext} context - The properties of the project.
 * @param {ModuleName[]} enabled - The modules the project has enabled.
 * @param {ModuleName[]} removed - The modules to remove, without any module the remaining ones require.
 * @return {ModuleChangeResult} The outcome of the change.
 */
export function disableModules(
  files: ProjectFiles,
  context: ProjectContext,
  enabled: ModuleName[],
  removed: ModuleName[]
): ModuleChangeResult {
  const scaffold: ModuleScaffold = {
    files,
    context,
    enabled: new Set(enabled),
    force: false,
    warnings: []
  };
  const packages = files.read('package.json');

  for (const name of sortModules(removed).reverse()) {
    if (!scaffold.enabled.has(name)) {
      continue;
    }

    for (const integration of [...integrations].reverse()) {
      if (isIntegrationOf(integration, name, scaffold.enabled)) {
        integration.disable?.(scaffold, name);
        removeFiles(scaffold, integration.modules.join('+'));
      }
    }

    const module = modules[name];
    updateModuleValues(files, context, module, false);
    updateDependencies(files, [], modulePackages(module, context));
    moduleEdits[name]?.disable(scaffold);
    removeFiles(scaffold, name);
    for (const dir of module.directories ?? []) {
      files.remove(dir);
    }

    scaffold.enabled.delete(name);
  }

  return {
    packagesChanged: files.read('package.json') !== packages,
    warnings: scaffold.warnings
  };
}

function isIntegrationOf(
  integration: ModuleIntegration,
  name: ModuleName,
  enabled: Set<ModuleName>
): boolean {
  return (
    integration.modules.includes(name) &&
    integration.modules.every((module) => enabled.has(module))
  );
}

/** Lists the files of a module or integration directory, for the project's runtime and database. */
function collectModuleFiles(
  unit: string,
  context: ProjectContext
): TemplateFile[] {
  return collectTemplateFiles(
    path.join(templatesDir, 'modules', unit),
    context.runtime
  ).filter(
    (file) =>
      !(file.path in databaseFiles) ||
      databaseFiles[file.path] === context.database
  );
}

/** The module files of a single database. */
const databaseFiles: Record<string, string> = {
  'database/mariadb-init.sh': 'mysql',
  'data/.gitkeep': 'sqlite'
};

/**
 * Copies the files of a module or integration directory into the project, skipping the existing ones unless forced.
 * Without the translation files, the English texts are written into the templates.
 */
function copyFiles(scaffold: ModuleScaffold, unit: string): void {
  const { files, context } = scaffold;
  const variables = { LOWER_NAME: context.name };

  for (const file of collectModuleFiles(unit, context)) {
    let content = readTemplateFile(file, variables);
    if (file.path.endsWith('.hbs') && !scaffold.enabled.has('locales')) {
      content = inlineTemplate(
        file.path,
        content.toString(),
        loadSourceTranslations()
      );
    }

    const existing = files.read(file.path);
    if (existing === content.toString()) {
      continue;
    }
    // A module file replacing a file of the base project, i.e. the end-to-end test of the server
    const replaced =
      existing !== undefined && existing === readBaseFile(file.path, context);
    if (existing !== undefined && !replaced && !scaffold.force) {
      scaffold.warnings.push(`Skipped the existing file ${file.path}`);
      continue;
    }
    files.write(file.path, content);
  }
}

/** The directories of the code written in the project, whose scaffolded files are kept once changed. */
const sourceDirs = ['src', 'database/seeders'];

/**
 * Deletes the files of a module or integration directory from the project, restoring the files of the base project
 * they replaced. The source files and seeders changed in the project are kept.
 */
function removeFiles(scaffold: ModuleScaffold, unit: string): void {
  const { files, context } = scaffold;
  const variables = { LOWER_NAME: context.name };
  const owned = (modules as Record<string, ModuleDefinition>)[unit]
    ?.directories;
  for (const file of collectTemplateFiles(
    path.join(templatesDir, 'modules', unit),
    context.runtime
  )) {
    // Deleted whatever its contents with the directories of the module
    if (owned?.some((dir) => isInside(file.path, dir))) {
      continue;
    }

    const existing = files.read(file.path);
    const changed =
      existing !== undefined &&
      existing !== readTemplateFile(file, variables).toString();
    if (changed && sourceDirs.some((dir) => isInside(file.path, dir))) {
      scaffold.warnings.push(`Kept the changed file ${file.path}`);
      continue;
    }

    const base = readBaseFile(file.path, context);
    if (base === undefined) {
      files.remove(file.path);
    } else if (!changed) {
      files.write(file.path, base);
    }
  }
}

function isInside(file: string, dir: string): boolean {
  return file === dir || file.startsWith(`${dir}/`);
}

/** Reads a file of the base project template, or returns `undefined` when it has none at the path. */
function readBaseFile(
  file: string,
  context: ProjectContext
): string | undefined {
  const template = collectTemplateFiles(
    path.join(templatesDir, 'base'),
    context.runtime
  ).find((base) => base.path === file);
  return template && readTemplateFile(template, {}).toString();
}

/** The start.sh container roles applying the migrations and seeding the database. */
function getDatabaseRoles(runtime: Runtime): string {
  const weaver = runtime === 'bun' ? 'bun weaver' : 'npx weaver';
  return (
    `elif [ "$role" = "migrations" ]; then\n  echo "Executing migrations..."\n  ${weaver} migrate\n\n` +
    `elif [ "$role" = "seed" ]; then\n  echo "Seeding database..."\n  ${weaver} seed\n\n`
  );
}

/** The template files a project is scaffolded with, of the enabled modules. */
function collectScaffoldedTemplates(scaffold: ModuleScaffold): TemplateFile[] {
  return [
    'templates',
    ...integrations
      .filter(({ modules }) =>
        modules.every((module) => scaffold.enabled.has(module))
      )
      .map(({ modules }) => modules.join('+'))
  ]
    .flatMap((unit) => collectModuleFiles(unit, scaffold.context))
    .filter((file) => file.path.endsWith('.hbs'));
}

/** The English translations of the scaffolded templates, which the mailer adds to the project's translation file. */
function readSourceTranslations(): Record<string, any> {
  return JSON.parse(
    fs.readFileSync(path.join(templatesDir, 'translations', 'en.json'), 'utf8')
  );
}

/** The flattened English translations of the scaffolded templates. */
function loadSourceTranslations(): Record<string, string> {
  return flattenTranslations(readSourceTranslations());
}

/** Adds the translations missing from the target, overwriting the existing ones when forced. */
function addTranslations(
  target: Record<string, any>,
  source: Record<string, any>,
  force: boolean
): void {
  for (const [key, value] of Object.entries(source)) {
    if (isObject(value) && isObject(target[key])) {
      addTranslations(target[key], value, force);
    } else if (force || !(key in target)) {
      target[key] = value;
    }
  }
}

/** Deletes the translations still equal to the source, and the objects they leave empty. */
function removeTranslations(
  target: Record<string, any>,
  source: Record<string, any>
): void {
  for (const [key, value] of Object.entries(source)) {
    if (isObject(value) && isObject(target[key])) {
      removeTranslations(target[key], value);
      if (Object.keys(target[key]).length === 0) {
        delete target[key];
      }
    } else if (target[key] === value) {
      delete target[key];
    }
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inlineTemplate(
  file: string,
  content: string,
  translations: Record<string, string>
): string {
  return inlineTranslations(content, translations, file.endsWith('.html.hbs'));
}

function editFile(
  scaffold: ModuleScaffold,
  file: string,
  edit: (content: string) => string
): void {
  const content = scaffold.files.read(file);
  if (content === undefined) {
    scaffold.warnings.push(`Unable to update the missing file ${file}`);
    return;
  }
  scaffold.files.write(file, edit(content));
}

/**
 * Inserts a text into a file before the anchor, or at its end without one, unless the file has it already. A missing
 * file is skipped, i.e. the ignored .env file of a cloned project.
 */
function addText(
  scaffold: ModuleScaffold,
  file: string,
  text: string,
  before?: string
): void {
  const content = scaffold.files.read(file);
  if (!text || content === undefined || content.includes(text)) {
    return;
  }

  const anchor =
    before === undefined ? content.length : content.indexOf(before);
  if (anchor < 0) {
    scaffold.warnings.push(`Unable to update the changed file ${file}`);
    return;
  }
  scaffold.files.write(
    file,
    content.slice(0, anchor) + text + content.slice(anchor)
  );
}

function removeText(
  scaffold: ModuleScaffold,
  file: string,
  text: string
): void {
  const content = scaffold.files.read(file);
  if (text && content?.includes(text)) {
    scaffold.files.write(
      file,
      content.replace(text, () => '')
    );
  }
}

function addBlock(scaffold: ModuleScaffold, block: DockerfileBlock): void {
  const content = scaffold.files.read('Dockerfile');
  const updated =
    content === undefined ? undefined : addDockerfileBlock(content, block);
  if (updated === undefined) {
    scaffold.warnings.push(
      `Unable to add the "${block.comment}" instructions to the Dockerfile`
    );
    return;
  }
  scaffold.files.write('Dockerfile', updated);
}

function removeBlock(scaffold: ModuleScaffold, block: DockerfileBlock): void {
  const content = scaffold.files.read('Dockerfile');
  if (content !== undefined) {
    scaffold.files.write(
      'Dockerfile',
      removeDockerfileBlock(content, block.comment)
    );
  }
}

/** The packages a module installs in a project. */
function modulePackages(
  module: ModuleDefinition,
  context: ProjectContext
): string[] {
  return [...module.packages, ...(module.projectPackages?.(context) ?? [])];
}

/** Sets the appweaver.json values and the values of the other JSON files of a module's new state. */
function updateModuleValues(
  files: ProjectFiles,
  context: ProjectContext,
  module: ModuleDefinition,
  enabled: boolean
): void {
  const config = moduleConfig(module, context);
  updateJson(
    files,
    'appweaver.json',
    enabled ? config : module.disabledConfig,
    enabled ? module.disabledConfig : config
  );
  for (const entries of module.jsonFiles?.(context) ?? []) {
    updateJson(
      files,
      entries.file,
      enabled ? entries.enabled : entries.disabled,
      enabled ? entries.disabled : entries.enabled
    );
  }
}

/**
 * Sets the values of a JSON file for a module's new state, and deletes the ones of its previous state that were not
 * changed in the project.
 */
function updateJson(
  files: ProjectFiles,
  file: string,
  set: ConfigEntry[],
  unset: ConfigEntry[]
): void {
  const config = files.readJson(file);
  if (!config) {
    return;
  }

  for (const [key, value] of set) {
    setValue(config, key, value);
  }
  const setKeys = set.map(([key]) => key);
  for (const [key, value] of unset) {
    if (!setKeys.includes(key) && getValue(config, key) === value) {
      deleteValue(config, key);
    }
  }

  files.writeJson(file, config);
}

/** Adds and removes dependencies of package.json, at their scaffold versions, keeping them sorted. */
function updateDependencies(
  files: ProjectFiles,
  added: string[],
  removed: string[]
): void {
  if (added.length === 0 && removed.length === 0) {
    return;
  }

  const pkg = files.readJson('package.json');
  if (!pkg) {
    return;
  }

  const dependencies: Record<string, string> = { ...pkg.dependencies };
  for (const name of added) {
    dependencies[name] ??= packageVersion(name);
  }
  for (const name of removed) {
    delete dependencies[name];
  }

  pkg.dependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))
  );
  files.writeJson('package.json', pkg);
}

function getValue(target: Record<string, any>, key: string): unknown {
  return key.split('.').reduce<any>((value, part) => value?.[part], target);
}

function setValue(
  target: Record<string, any>,
  key: string,
  value: unknown
): void {
  const parts = key.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts.at(-1)!] = value;
}

/** Deletes a value, and the objects it leaves empty below the top level. */
function deleteValue(target: Record<string, any>, key: string): void {
  const parts = key.split('.');
  const parents = [target];
  for (const part of parts.slice(0, -1)) {
    const next = parents.at(-1)![part];
    if (typeof next !== 'object' || next === null) {
      return;
    }
    parents.push(next);
  }

  delete parents.at(-1)![parts.at(-1)!];
  for (let i = parents.length - 1; i > 1; i--) {
    if (Object.keys(parents[i]).length === 0) {
      delete parents[i - 1][parts[i - 1]];
    }
  }
}
