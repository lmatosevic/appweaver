import path from 'node:path';
import fsp from 'node:fs/promises';
import { Database, isFunction, makeHash } from '@appweaver/common';
import { Seeder as SeederRecord } from '../prisma/client/client';
import { LifecycleManager } from '../app/lifecycle-manager';
import { PrismaDatabase } from '../database';
import { inject } from '../context';
import { importModule } from '../utils';

/**
 * Represents a seeder class that manages the application seeders processes.
 */
export class Seeder extends LifecycleManager {
  /** @internal */
  private readonly _db = inject<PrismaDatabase>(Database as any);

  constructor(
    private readonly _dirPath: string,
    private readonly _continueOnError: boolean = false
  ) {
    super();
  }

  /**
   * Executes the seeders by discovering, validating, and running seeder files.
   * Logs the seeding process, including warnings for checksum mismatches
   * and files that do not exist but are present in database table.
   *
   * @return Resolves when all seeders have been processed. Logs relevant
   * information during execution.
   */
  public async seed(): Promise<void> {
    await this.init();

    const seederFiles = await this.loadSeederFiles();

    let calledSeedersCount: number = 0;

    const relativePath = this._dirPath
      .replace(process.cwd(), '.')
      .replace(/\\/g, '/');

    console.log(
      `${seederFiles.length} seeder${seederFiles.length === 1 ? '' : 's'} found in ${relativePath}`
    );
    console.log('');

    // For each seeder file, skip if it has already been seeded, otherwise
    // execute all of it's exported functions and write results to a database
    for (const seederFile of seederFiles) {
      const seederName = this.seederName(seederFile);

      const seeder = await this.getSeeder(seederFile);
      if (seeder) {
        const checksum = await this.seederHash(seederFile);
        if (checksum !== seeder.checksum) {
          console.warn(
            `Warning: seeder ${seederName} has different checksum: ${checksum}, expected checksum: ${seeder.checksum}`
          );
          console.log('');
        }
        continue;
      }

      console.log(`Seeding ${seederName}...`);

      await this.executeSeeder(seederFile);

      console.log(`${seederName} seeded.`);
      console.log('');

      calledSeedersCount++;
    }

    const seedersWithoutFiles = await this.findSeedersWithoutFiles(seederFiles);
    for (const seeder of seedersWithoutFiles) {
      console.warn(
        `Warning: seeder ${seeder.seederName} does not exist but is present in database table.`
      );
      console.log('');
    }

    if (calledSeedersCount === 0) {
      console.log(`No pending seeders to execute.`);
    }
  }

  public async close(): Promise<void> {
    await this.destroy();
  }

  /** @internal */
  private async loadSeederFiles(): Promise<string[]> {
    const entries = await fsp.readdir(this._dirPath, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          e.isFile() && /\.(js|ts)$/.test(e.name) && !e.name.endsWith('.d.ts')
      )
      .map((e) => e.name)
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      )
      .map((name) => path.join(this._dirPath, name));
  }

  /** @internal */
  private async executeSeeder(seederFile: string): Promise<void> {
    const start = new Date();

    const { value, error } = await importModule(seederFile);
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

    const seederHash = await this.seederHash(seederFile);

    // Insert seeder result into the database
    await this._db.client().seeder.create({
      data: {
        checksum: seederHash,
        seederName: this.seederName(seederFile),
        startedAt: start,
        finishedAt: new Date(),
        logs: logs.length > 0 ? logs.join('\n') : null
      }
    });
  }

  /** @internal */
  private async findSeedersWithoutFiles(
    seederFiles: string[]
  ): Promise<SeederRecord[]> {
    const seederNames = seederFiles.map((file) => this.seederName(file));
    return this._db.client().seeder.findMany({
      where: {
        seederName: { notIn: seederNames }
      }
    });
  }

  /** @internal */
  private async getSeeder(seederFile: string): Promise<SeederRecord | null> {
    const seederName = this.seederName(seederFile);
    return this._db.client().seeder.findFirst({ where: { seederName } });
  }

  /** @internal */
  private async seederHash(seederFile: string): Promise<string> {
    const seederContent = await fsp.readFile(seederFile, 'utf8');
    return makeHash(seederContent);
  }

  /** @internal */
  private seederName(seederFile: string): string {
    if (seederFile.endsWith('.ts')) {
      return path.basename(seederFile, '.ts');
    }
    return path.basename(seederFile, '.js');
  }
}
