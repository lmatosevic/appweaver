import { Command } from 'commander';
import { compareVersions } from '@appweaver/common';
import { loadLocalPackageJson } from '../utils';
import {
  fetchScaffoldDependencies,
  loadInstalledVersion,
  PackageUpdate,
  resolveScaffoldUpdates
} from './scaffold-dependencies';
import { updatePackages } from './update-packages';
import { updateSkillFiles } from './update-skill';

export function updateCommand(program: Command): void {
  program
    .command('update')
    .alias('u')
    .description('Update the Appweaver packages and their companion packages.')
    .argument(
      '[packages...]',
      'A list of packages to update (e.g. @appweaver/core @appweaver/cli).' +
        'Defaults to all currently installed @appweaver/* packages.'
    )
    .option(
      '--target-version [version]',
      'The version to update the packages.',
      'latest'
    )
    .option(
      '--no-skill',
      'Skip updating AI agents skill files in the agent directories (e.g. .claude, .agents) of the current project.'
    )
    .option(
      '--no-companions',
      'Skip updating the installed companion packages (e.g. prisma, bullmq, nodemailer) to the versions of the target release.'
    )
    .option(
      '--tooling',
      'Also update the installed tooling packages (e.g. eslint, jest, prettier) to the versions of the target release.'
    )
    .option(
      '--dry-run',
      'Print the packages that would be updated without installing them.'
    )
    .option(
      '-f, --force',
      'Force update despite peerDependency version mismatches.'
    )
    .option('--verbose', 'Print verbose output.')
    .action(async (packages: string[], _, command: Command) => {
      const quiet = !command.getOptionValue('verbose');
      const force = command.getOptionValue('force');
      const updateSkill = command.getOptionValue('skill');
      const updateCompanions = command.getOptionValue('companions');
      const updateTooling = !!command.getOptionValue('tooling');
      const dryRun = !!command.getOptionValue('dryRun');
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

      // The target version applies only to the Appweaver packages
      const appweaverPackages = packagesToUpdate.filter((p) =>
        p.startsWith('@appweaver/')
      );

      if (appweaverPackages.length === 0) {
        console.log(`No @appweaver packages found for update.`);
        process.exit(0);
      }

      // Check if there are already greater versions installed for each package
      if (targetVersion !== 'latest' && !quiet) {
        for (const packageName of appweaverPackages) {
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

      const updates: PackageUpdate[] = [];
      for (const name of appweaverPackages) {
        const from =
          (await loadInstalledVersion(name)) ??
          installedPackages[name] ??
          'none';
        updates.push({ name, from, to: targetVersion });
      }

      // Companion and tooling packages follow the versions the target release is built with
      if (updateCompanions || updateTooling) {
        const scaffold = await fetchScaffoldDependencies(targetVersion);
        if (scaffold) {
          updates.push(
            ...(await resolveScaffoldUpdates(scaffold, installedPackages, {
              companion: updateCompanions,
              tooling: updateTooling
            }))
          );
        } else {
          console.warn(
            `Unable to resolve the companion package versions of @appweaver/cli@${targetVersion}, ` +
              'updating only the Appweaver packages.'
          );
        }
      }

      if (dryRun) {
        console.log('Packages that would be updated:');
        printUpdates(updates);
        return;
      }

      const status = await updatePackages(
        Object.fromEntries(updates.map(({ name, to }) => [name, to])),
        force,
        quiet
      );

      if (status === 0) {
        if (updateSkill) {
          await updateSkillFiles(quiet);
        }
        console.log(`Successfully updated packages:`);
        printUpdates(updates);

        if (updates.some(({ name }) => isPrismaPackage(name))) {
          console.log(
            '\nPrisma was updated, run `weaver generate` to regenerate the Prisma client.'
          );
        }
      } else {
        console.error(
          'Update did not complete successfully. Use --verbose flag to see error details.'
        );
        process.exit(1);
      }
    });
}

function printUpdates(updates: PackageUpdate[]): void {
  const width = Math.max(...updates.map(({ name }) => name.length));
  for (const { name, from, to } of updates) {
    console.log(`  ${name.padEnd(width)}  ${from} -> ${to}`);
  }
}

function isPrismaPackage(name: string): boolean {
  return name === 'prisma' || name.startsWith('@prisma/');
}
