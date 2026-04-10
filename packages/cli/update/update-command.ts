import { Command } from 'commander';
import { compareVersions } from '@appweaver/common';
import { loadLocalPackageJson } from '../utils';
import { updatePackages } from './update-packages';
import { updateSkillFiles } from './update-skill';

export function updateCommand(program: Command): void {
  program
    .command('update')
    .alias('u')
    .description('Update the Appweaver packages.')
    .argument(
      '[packages...]',
      'A list of packages to update (e.g. @appweaver/core @appweaver/cli).' +
        'Defaults to all currently installed @appweaver/* packages.'
    )
    .option(
      '--targetVersion [targetVersion]',
      'The version to update the packages.',
      'latest'
    )
    .option(
      '--noSkill',
      'Skip updating AI agents skill files in the current project.'
    )
    .option(
      '-f, --force',
      'Force update despite peerDependency version mismatches.'
    )
    .option('--verbose', 'Print verbose output.')
    .action(async (packages: string[], _, command: Command) => {
      const quiet = !command.getOptionValue('verbose');
      const force = command.getOptionValue('force');
      const updateSkill = !command.getOptionValue('noSkill');
      const targetVersion = command.getOptionValue('targetVersion');

      // Load all currently installed packages
      const installedPackages: Record<string, string> = {};
      try {
        const pkg = await loadLocalPackageJson();
        const allDeps: Record<string, string> = {
          ...(pkg.dependencies ?? {}),
          ...(pkg.devDependencies ?? {})
        };
        for (const [name, version] of Object.entries(allDeps)) {
          installedPackages[name] = version;
        }
      } catch (e) {
        if (!quiet) {
          console.error(e);
        }
        console.error('Unable to open package.json file');
        process.exit(1);
      }

      // Create a list of packages to update (without version suffix)
      const packagesToUpdate: string[] = [];
      if (packages.length > 0) {
        packagesToUpdate.push(
          ...packages.map((p) => {
            const at = p.lastIndexOf('@');
            return at > 0 ? p.slice(0, at) : p;
          })
        );
      } else {
        packagesToUpdate.push(...Object.keys(installedPackages));
      }

      // This command should only update Appweaver packages
      const appweaverPackages = packagesToUpdate.filter((p) =>
        p.startsWith('@appweaver/')
      );

      if (appweaverPackages.length === 0) {
        console.log(`No @appweaver packages found for update.`);
        process.exit(0);
      }

      // Check if there are already greater versions installed for each package
      if (targetVersion !== 'latest' && !quiet) {
        for (const packageName of packagesToUpdate) {
          const installedPackageVersion = installedPackages[packageName];
          if (installedPackageVersion) {
            const cleanInstalled = installedPackageVersion.replace(
              /^[^0-9]*/,
              ''
            );
            if (compareVersions(cleanInstalled, targetVersion) > 0) {
              console.warn(
                `${packageName} already has greater version ${cleanInstalled} than the requested version ${targetVersion}`
              );
            }
          }
        }
      }

      const status = await updatePackages(
        appweaverPackages,
        targetVersion,
        force,
        quiet
      );

      if (status === 0) {
        if (updateSkill) {
          await updateSkillFiles(quiet);
        }
        console.log(
          `Successfully updated packages to ${targetVersion} version.`
        );
      } else {
        console.error(
          'Update did not complete successfully. Use --verbose flag to see error details.'
        );
        process.exit(1);
      }
    });
}
