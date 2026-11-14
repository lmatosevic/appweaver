import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {
  Database,
  importModule,
  isFunction,
  makeHash
} from '@appweaver/common';
import { Seeder as SeederRecord } from '../prisma/client/client';
import { LifecycleManager } from '@appweaver/core/internal';
import { isPrismaError, PrismaDatabase } from '../database';
import { inject } from '@appweaver/core';

/** The seeders directory of a module, whose seeders run before the ones of the application. */
export type ModuleSeeders = {
  /** The name of the module, prefixing the names of its seeders, i.e. `billing/1-plans`. */
  name: string;
  /** The absolute path of the seeders directory. */
  path: string;
};

/** A seeder file, with the name it is recorded under. */
type SeederFile = { path: string; name: string };

/**
 * Represents a seeder class that manages the application seeders processes.
 */
export class Seeder extends LifecycleManager {
  /** @internal */
  private readonly _db = inject<PrismaDatabase>(Database as any);

  constructor(
    private readonly _dirPath: string,
    private readonly _continueOnError: boolean = false,
    private readonly _fixWarnings: boolean = false,
    private readonly _moduleSeeders: ModuleSeeders[] = [],
    private readonly _dryRun: boolean = false
  ) {
    super();
  }

  /**
   * Executes the seeders by discovering, validating, and running seeder files.
   * Logs the seeding process, including warnings for checksum mismatches
   * and files that do not exist but are present in the database table. A dry
   * run only logs the seeders it would execute and the warnings it would fix.
   *
   * @return Resolves when all seeders have been processed. Logs relevant
   * information during execution.
   */
  public async seed(): Promise<void> {
    await this.init();

    // The seeders of the modules run first, in their load order
    const directories = [
      ...this._moduleSeeders,
      { name: '', path: this._dirPath }
    ];
    const seederFiles: SeederFile[] = [];
    const missing: string[] = [];
    for (const { name, path: dirPath } of directories) {
      try {
        seederFiles.push(...(await this.loadSeederFiles(dirPath, name)));
      } catch {
        console.warn(`Seeders directory ${dirPath} is not accessible`);
        missing.push(name);
      }
    }
    if (missing.length === directories.length) {
      console.error('No seeders directory is accessible');
      return;
    }

    let calledSeedersCount: number = 0;

    const relativePath = this._dirPath
      .replace(process.cwd(), '.')
      .replace(/\\/g, '/');
    const modulesCount = this._moduleSeeders.length;

    console.log(
      `${seederFiles.length} seeder${seederFiles.length === 1 ? '' : 's'} found in ${relativePath}${
        modulesCount > 0
          ? ` and ${modulesCount} module${modulesCount === 1 ? '' : 's'}`
          : ''
      }`
    );
    console.log('');

    const recorded = await this.recordedSeeders();

    // For each seeder file, skip if it has already been seeded, otherwise
    // execute all of it's exported functions and write results to a database
    for (const seederFile of seederFiles) {
      const seederName = seederFile.name;

      const seeder = recorded.get(seederName);
      if (seeder) {
        const checksum = await this.seederHash(seederFile.path);
        if (checksum !== seeder.checksum) {
          console.warn(
            `Warning: seeder ${seederName} has different checksum: ${checksum}, expected checksum: ${seeder.checksum}`
          );

          if (this._fixWarnings && !this._dryRun) {
            await this._db.client().seeder.update({
              where: { id: seeder.id },
              data: { checksum }
            });
          }
          if (this._fixWarnings) {
            console.log(
              `Fix: seeder checksum ${this._dryRun ? 'would be ' : ''}updated`
            );
          }

          console.log('');
        }
        continue;
      }

      if (this._dryRun) {
        console.log(`Would seed ${seederName}`);
      } else {
        console.log(`Seeding ${seederName}...`);
        await this.executeSeeder(seederFile);
        console.log(`${seederName} seeded`);
      }
      console.log('');

      calledSeedersCount++;
    }

    // The seeders of a missing directory are not reported as deleted
    const seederNames = new Set(seederFiles.map((file) => file.name));
    const seedersWithoutFiles = [...recorded.values()].filter(
      (seeder) =>
        !seederNames.has(seeder.seederName) &&
        !missing.includes(this.seederOwner(seeder.seederName))
    );
    for (const seeder of seedersWithoutFiles) {
      console.warn(
        `Warning: seeder ${seeder.seederName} does not exist but is present in database table`
      );

      if (this._fixWarnings && !this._dryRun) {
        await this._db.client().seeder.delete({ where: { id: seeder.id } });
      }
      if (this._fixWarnings) {
        console.log(
          `Fix: ${this._dryRun ? 'would remove' : 'removed'} seeder from database`
        );
      }

      console.log('');
    }

    const seeders = `${calledSeedersCount} seeder${calledSeedersCount === 1 ? '' : 's'}`;
    if (calledSeedersCount === 0) {
      console.log(`No pending seeders to execute`);
    } else if (this._dryRun) {
      console.log(`${seeders} would be executed`);
    } else {
      console.log(`Executed ${seeders}`);
    }
    if (this._dryRun) {
      console.log('Dry run, no seeder was run.');
    }
  }

  /** Destroys the services the seeder started, i.e. the database connection. */
  public async close(): Promise<void> {
    await this.destroy();
  }

  /** @internal */
  private async loadSeederFiles(
    dirPath: string,
    moduleName: string
  ): Promise<SeederFile[]> {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          e.isFile() && /\.(js|ts)$/.test(e.name) && !e.name.endsWith('.d.ts')
      )
      .map((e) => e.name)
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      )
      .map((fileName) => {
        const name = fileName.replace(/\.(js|ts)$/, '');
        return {
          path: path.join(dirPath, fileName),
          name: moduleName ? `${moduleName}/${name}` : name
        };
      });
  }

  /** @internal */
  private async executeSeeder(seederFile: SeederFile): Promise<void> {
    const start = new Date();

    const { value, error } = await importModule(seederFile.path);
    if (error) {
      if (this._continueOnError) {
        console.error(error);
        return;
      }
      throw error;
    }

    const logs: string[] = [];

    // Execute all exported functions from a seeder file and log errors or
    // function responses
    for (const seederFn of Object.values(value)) {
      if (isFunction(seederFn)) {
        try {
          const result = await seederFn();
          if (result) {
            logs.push(JSON.stringify(result));
          }
        } catch (e) {
          if (!this._continueOnError) {
            throw e;
          }
          console.error(e);
          logs.push(`Error: ${(e as Error).message}`);
        }
      }
    }

    const checksum = await this.seederHash(seederFile.path);

    // Insert seeder result into the database
    await this._db.client().seeder.create({
      data: {
        checksum,
        seederName: seederFile.name,
        startedAt: start,
        finishedAt: new Date(),
        logs: logs.length > 0 ? logs.join('\n') : null
      }
    });
  }

  /**
   * Reads the recorded seeders by their names. A dry run of a database that is not migrated yet has none, so it lists
   * every seeder.
   *
   * @internal
   */
  private async recordedSeeders(): Promise<Map<string, SeederRecord>> {
    try {
      const seeders = await this._db.client().seeder.findMany();
      return new Map(seeders.map((seeder) => [seeder.seederName, seeder]));
    } catch (e) {
      // P1003 and P2021: the database or the seeders table does not exist
      if (
        this._dryRun &&
        isPrismaError(e) &&
        ['P1003', 'P2021'].includes(String(e.code))
      ) {
        console.log(
          'The database is not migrated yet, every seeder is pending'
        );
        console.log('');
        return new Map();
      }
      throw e;
    }
  }

  /** @internal */
  private seederOwner(seederName: string): string {
    const owner = this._moduleSeeders.find(({ name }) =>
      seederName.startsWith(`${name}/`)
    );
    return owner?.name ?? '';
  }

  /** @internal */
  private async seederHash(seederFile: string): Promise<string> {
    return makeHash(fs.createReadStream(seederFile, 'utf8'));
  }
}
