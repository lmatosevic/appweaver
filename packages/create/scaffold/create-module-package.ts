import path from 'node:path';
import { frameworkVersion, packageVersion } from './package-versions';
import { ProjectFiles } from './project-files';
import {
  collectTemplateFiles,
  readTemplateFile,
  templatesDir
} from './template-files';
import { ScaffoldError } from './types';

/** The contract the driver of a module package implements, `none` for a feature module. */
export const moduleContracts = ['storage', 'mailer', 'none'] as const;

export type ModuleContract = (typeof moduleContracts)[number];

export type CreateModulePackageOptions = {
  /** The directory the package is created in. */
  dir: string;
  /** The npm name of the package, i.e. `@acme/appweaver-gcs`. */
  packageName: string;
  description: string;
  contract: ModuleContract;
};

const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * Derives the short name of a module from its package name, without the scope and the `appweaver-` prefix, i.e. `gcs`
 * of `@acme/appweaver-gcs`.
 *
 * @param {string} packageName - The npm name of the package.
 * @return {string} The short name, the name of its provider.
 */
export function moduleShortName(packageName: string): string {
  return packageName
    .replace(/^@[^/]+\//, '')
    .replace(/^appweaver-/, '')
    .replace(/-appweaver$/, '');
}

/**
 * Creates a module package from the module templates: its manifest, config section, a driver of the contract with
 * the test running the contract suite of `@appweaver/testing`, or the startup code of a feature module.
 *
 * @param {CreateModulePackageOptions} options - The name, description and contract of the package.
 * @return {Promise<string[]>} The paths of the created files.
 * @throws {ScaffoldError} When the package name is not a valid npm name.
 */
export async function createModulePackage(
  options: CreateModulePackageOptions
): Promise<string[]> {
  const { dir, packageName, contract } = options;
  if (!PACKAGE_NAME.test(packageName)) {
    throw new ScaffoldError(`Invalid package name: ${packageName}`);
  }

  const shortName = moduleShortName(packageName);
  const pascalName = shortName
    .split(/[-._]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const camelName = pascalName.charAt(0).toLowerCase() + pascalName.slice(1);
  // A driver nests its section under its contract, a feature module takes its own
  const section = contract === 'none' ? camelName : `${contract}.${camelName}`;
  const suffix =
    contract === 'none' ? '' : contract === 'storage' ? 'Storage' : 'Mailer';

  const variables: Record<string, string> = {
    PACKAGE_NAME: packageName,
    DESCRIPTION: options.description,
    MODULE_NAME: shortName,
    CLASS_NAME: `${pascalName}${suffix}`,
    CONFIG_NAME: `${camelName}Config`,
    LOGGER_NAME: camelName,
    CONFIG_SECTION: section,
    CONFIG_PREFIX:
      section
        .split('.')
        .map((part) => part.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase())
        .join('_') + '_',
    USAGE:
      contract === 'none'
        ? 'It runs its startup code in every application that installs it.'
        : `Select its driver with \`"${contract}": { "provider": "${shortName}" }\`, or leave \`auto\`.`,
    VERSION: frameworkVersion,
    TYPEBOX_VERSION: packageVersion('@sinclair/typebox'),
    DEV_DEPENDENCIES: [
      '@sinclair/typebox',
      '@swc/core',
      '@swc/jest',
      '@types/jest',
      '@types/node',
      'jest',
      'typescript'
    ]
      .map((name) => `    "${name}": "${packageVersion(name)}"`)
      .join(',\n')
  };

  const files = new ProjectFiles(dir);
  for (const templateDir of ['common', contract]) {
    for (const file of collectTemplateFiles(
      path.join(templatesDir, 'module-package', templateDir),
      'node'
    )) {
      // npm leaves the .gitignore files out of the published templates
      const target = file.path === 'gitignore' ? '.gitignore' : file.path;
      files.write(target, readTemplateFile(file, variables));
    }
  }

  const written = files.changes().map(({ path: file }) => file);
  await files.commit();
  return written;
}
