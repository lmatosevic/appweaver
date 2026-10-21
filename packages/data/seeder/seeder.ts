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
import { PrismaDatabase } from '../database/prisma-database';
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
    private readonly _moduleSeeders: ModuleSeeders[] = []
  ) {
    super();
  }

  /**
   * Executes the seeders by discovering, validating, and running seeder files.
   * Logs the seeding process, including warnings for checksum mismatches
   * and files that do not exist but are present in the database table.
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

    // For each seeder file, skip if it has already been seeded, otherwise
    // execute all of it's exported functions and write results to a database
    for (const seederFile of seederFiles) {
      const seederName = seederFile.name;

      const seeder = await this.getSeeder(seederName);
      if (seeder) {
        const checksum = await this.seederHash(seederFile.path);
        if (checksum !== seeder.checksum) {
          console.warn(
            `Warning: seeder ${seederName} has different checksum: ${checksum}, expected checksum: ${seeder.checksum}`
          );

          if (this._fixWarnings) {
            await this._db.client().seeder.update({
              where: { id: seeder.id },
              data: { checksum }
            });
            console.log('Fix: seeder checksum updated');
          }

          console.log('');
        }
        continue;
      }

      console.log(`Seeding ${seederName}...`);

      await this.executeSeeder(seederFile);

      console.log(`${seederName} seeded`);
      console.log('');

      calledSeedersCount++;
    }

    // The seeders of a missing directory are not reported as deleted
    const seedersWithoutFiles = (
      await this.findSeedersWithoutFiles(seederFiles)
    ).filter(
      (seeder) => !missing.includes(this.seederOwner(seeder.seederName))
    );
    for (const seeder of seedersWithoutFiles) {
      console.warn(
        `Warning: seeder ${seeder.seederName} does not exist but is present in database table`
      );

      if (this._fixWarnings) {
        await this._db.client().seeder.delete({ where: { id: seeder.id } });
        console.log('Fix: removed seeder from database');
      }

      console.log('');
    }

    if (calledSeedersCount === 0) {
      console.log(`No pending seeders to execute`);
    } else {
      console.log(
        `Executed ${calledSeedersCount} seeder${calledSeedersCount === 1 ? '' : 's'}`
      );
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

  /** @internal */
  private async findSeedersWithoutFiles(
    seederFiles: SeederFile[]
  ): Promise<SeederRecord[]> {
    const seederNames = seederFiles.map((file) => file.name);
    return this._db.client().seeder.findMany({
      where: {
        seederName: { notIn: seederNames }
      }
    });
  }

  /** @internal */
  private seederOwner(seederName: string): string {
    const owner = this._moduleSeeders.find(({ name }) =>
      seederName.startsWith(`${name}/`)
    );
    return owner?.name ?? '';
  }

  /** @internal */
  private async getSeeder(seederName: string): Promise<SeederRecord | null> {
    return this._db.client().seeder.findFirst({ where: { seederName } });
  }

  /** @internal */
  private async seederHash(seederFile: string): Promise<string> {
    return makeHash(fs.createReadStream(seederFile, 'utf8'));
  }
}
