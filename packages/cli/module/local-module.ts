import fs from 'node:fs';
import path from 'node:path';
import { snakeToCamelCase } from '@appweaver/common';

/** The files of a new local module, keyed by their path relative to the project root. */
export type ModuleFiles = Record<string, string>;

const MODULE_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Creates the files of a local module in `<sourcePath>/modules/<name>/`: the manifest found by `app.modulesPattern`,
 * its config section and the code it runs at startup.
 *
 * @param {string} name - The kebab-case name of the module, i.e. `billing`.
 * @param {string} [sourcePath='./src'] - The source directory of the project.
 * @return {ModuleFiles} The files of the module.
 * @throws {Error} When the name is not kebab-case.
 */
export function localModuleFiles(
  name: string,
  sourcePath: string = './src'
): ModuleFiles {
  if (!MODULE_NAME.test(name)) {
    throw new Error(
      `Module name must be kebab-case, i.e. billing or audit-log: ${name}`
    );
  }

  const section = snakeToCamelCase(name, '-');
  const directory = path.join(sourcePath, 'modules', name);

  return {
    [path.join(directory, 'module.ts')]:
      `import { defineModule } from '@appweaver/common';
import { ${section}Config } from './config';

/** The ${name} module, enabled by its file matching app.modulesPattern. */
export default defineModule({
  name: '${name}',
  config: [${section}Config],
  // Drivers of a contract, selected by name in its provider key:
  // providers: [{ contract: Storage, name: '${name}', load: () => import('./${name}-storage') }],
  // Classes defined at startup, with their lifecycle hooks:
  // services: [{ load: () => import('./${name}-service') }],
  main: () => import('./main')
});
`,
    [path.join(directory, 'config.ts')]:
      `import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

/** The config of the ${name} module, read from config.${section} and the ${section.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()}_* variables. */
export const ${section}Config = defineConfig('${section}', {
  /** Enable the ${name} module. Default: \`true\`. */
  ENABLED: Type.Boolean({ default: true })
});
`,
    [path.join(directory, 'main.ts')]:
      `import { logger } from '@appweaver/common';
import { ${section}Config } from './config';

// Runs at startup: scheduled jobs, queue workers, event listeners
if (${section}Config.ENABLED) {
  logger.debug('Module ${name} loaded');
}
`
  };
}

/**
 * Writes the files of a new module, refusing to overwrite an existing module.
 *
 * @param {string} rootPath - The project root.
 * @param {ModuleFiles} files - The files of the module.
 * @throws {Error} When a file of the module exists.
 */
export function writeModuleFiles(rootPath: string, files: ModuleFiles): void {
  const existing = Object.keys(files).filter((file) =>
    fs.existsSync(path.join(rootPath, file))
  );
  if (existing.length > 0) {
    throw new Error(`Module files exist already: ${existing.join(', ')}`);
  }
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(rootPath, file)), { recursive: true });
    fs.writeFileSync(path.join(rootPath, file), content);
  }
}
