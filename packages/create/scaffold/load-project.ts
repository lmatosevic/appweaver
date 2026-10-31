import { detectDatabase } from './database-config';
import { modules } from './modules';
import { ProjectFiles } from './project-files';
import {
  moduleNames,
  ModuleName,
  ProjectContext,
  ScaffoldError
} from './types';

/** An existing project, with the modules it has enabled. */
export type LoadedProject = {
  files: ProjectFiles;
  context: ProjectContext;
  enabled: ModuleName[];
};

/**
 * Loads an existing project from its package.json and appweaver.json files. A module is enabled when the project
 * depends on its packages, or for a module without packages, when its marker file exists. The database is the one of
 * its Prisma driver adapter, SQLite without one, and the server listens on its configured port, by default `5000`, and
 * host, by default the `0.0.0.0` of the web module.
 *
 * @param {string} dir - The project directory.
 * @param {ProjectFiles} [files] - The files the project is read from, by default the ones of its directory.
 * @return {LoadedProject} The project files, properties and enabled modules.
 * @throws {ScaffoldError} When the directory has no package.json or appweaver.json.
 */
export function loadProject(
  dir: string,
  files: ProjectFiles = new ProjectFiles(dir)
): LoadedProject {
  const pkg = files.readJson('package.json');
  if (!pkg) {
    throw new ScaffoldError(`No package.json file found in ${dir}`);
  }
  const appConfig = files.readJson('appweaver.json');
  if (!appConfig) {
    throw new ScaffoldError(`No appweaver.json file found in ${dir}`);
  }

  const dependencies: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies
  };

  const server = appConfig.config?.server;
  const port = Number(server?.port);
  const context: ProjectContext = {
    name: pkg.name ?? 'app',
    port: Number.isInteger(port) ? port : 5000,
    runtime: appConfig.config?.app?.runtime === 'bun' ? 'bun' : 'node',
    database: detectDatabase(dependencies) ?? 'sqlite',
    ...(typeof server?.host === 'string' && { host: server.host })
  };

  const enabled = moduleNames.filter((name) => {
    const { packages, marker } = modules[name];
    return packages.length > 0
      ? packages.every((pkgName) => dependencies[pkgName])
      : files.exists(marker!);
  });

  return { files, context, enabled };
}
