import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/** A change a {@link ProjectFiles} commit applies to a project file. */
export type FileChange = {
  path: string;
  type: 'create' | 'update' | 'delete';
};

/**
 * The files of a project, staging every write and deletion in memory until {@link commit}, so a module change is
 * planned completely (or printed as a dry run) before any file is touched. Paths are relative to the project
 * directory, separated by forward slashes.
 */
export class ProjectFiles {
  private readonly writes = new Map<string, string | Buffer>();
  private readonly deletes = new Set<string>();

  constructor(public readonly dir: string) {}

  /** Whether the file or directory exists, after the staged changes. */
  public exists(file: string): boolean {
    const rel = normalize(file);
    if (this.writes.has(rel) || this.stagedUnder(rel).length > 0) {
      return true;
    }
    return !this.isDeleted(rel) && fs.existsSync(this.resolve(rel));
  }

  /** Reads a text file, or returns `undefined` when it does not exist. */
  public read(file: string): string | undefined {
    const rel = normalize(file);
    const staged = this.writes.get(rel);
    if (staged !== undefined) {
      return staged.toString();
    }
    if (this.isDeleted(rel)) {
      return undefined;
    }
    const abs = this.resolve(rel);
    return fs.existsSync(abs) && fs.statSync(abs).isFile()
      ? fs.readFileSync(abs, 'utf8')
      : undefined;
  }

  /** Reads and parses a JSON file, or returns `undefined` when it does not exist. */
  public readJson<T = Record<string, any>>(file: string): T | undefined {
    const content = this.read(file);
    return content === undefined ? undefined : JSON.parse(content);
  }

  public write(file: string, content: string | Buffer): void {
    this.writes.set(normalize(file), content);
  }

  /** Writes the value as a JSON file, indented by two spaces. */
  public writeJson(file: string, value: unknown): void {
    this.write(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  /** Deletes a file, or a directory with all of its contents. */
  public remove(file: string): void {
    const rel = normalize(file);
    this.writes.delete(rel);
    for (const staged of this.stagedUnder(rel)) {
      this.writes.delete(staged);
    }
    if (fs.existsSync(this.resolve(rel))) {
      this.deletes.add(rel);
    }
  }

  /**
   * Lists the files inside a directory and its subdirectories, after the staged changes. An empty path lists the
   * whole project.
   */
  public list(dir: string): string[] {
    const rel = normalize(dir);
    const files = new Set(this.stagedUnder(rel));
    const abs = this.resolve(rel);
    if (
      !this.isDeleted(rel) &&
      fs.existsSync(abs) &&
      fs.statSync(abs).isDirectory()
    ) {
      for (const entry of fs.readdirSync(abs, {
        recursive: true,
        withFileTypes: true
      })) {
        const file = normalize(
          path.relative(this.dir, path.join(entry.parentPath, entry.name))
        );
        if (entry.isFile() && !this.isDeleted(file)) {
          files.add(file);
        }
      }
    }
    return [...files].sort();
  }

  /** The changes the staged writes and deletions make to the project. */
  public changes(): FileChange[] {
    const changes: FileChange[] = [];
    for (const rel of this.deletes) {
      if (!this.writes.has(rel)) {
        changes.push({ path: rel, type: 'delete' });
      }
    }
    for (const [rel, content] of this.writes) {
      const abs = this.resolve(rel);
      if (this.isDeleted(rel) || !fs.existsSync(abs)) {
        changes.push({ path: rel, type: 'create' });
      } else if (!fs.readFileSync(abs).equals(Buffer.from(content))) {
        changes.push({ path: rel, type: 'update' });
      }
    }
    return changes.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Applies the staged changes, deleting before writing. The directories a deletion leaves empty are deleted too.
   */
  public async commit(): Promise<void> {
    for (const rel of this.deletes) {
      await fsp.rm(this.resolve(rel), { recursive: true, force: true });
      await this.removeEmptyParents(rel);
    }
    // Written concurrently, since every file is written once
    await Promise.all(
      [...this.writes].map(async ([rel, content]) => {
        const abs = this.resolve(rel);
        await fsp.mkdir(path.dirname(abs), { recursive: true });
        await fsp.writeFile(abs, content);
      })
    );
    this.writes.clear();
    this.deletes.clear();
  }

  private resolve(rel: string): string {
    return path.join(this.dir, rel);
  }

  private isDeleted(rel: string): boolean {
    for (const deleted of this.deletes) {
      if (rel === deleted || rel.startsWith(`${deleted}/`)) {
        return true;
      }
    }
    return false;
  }

  private stagedUnder(rel: string): string[] {
    const files = [...this.writes.keys()];
    return rel === ''
      ? files
      : files.filter((file) => file.startsWith(`${rel}/`));
  }

  private async removeEmptyParents(rel: string): Promise<void> {
    let dir = path.dirname(rel);
    while (dir !== '.' && dir !== '') {
      const abs = this.resolve(dir);
      if (!fs.existsSync(abs) || fs.readdirSync(abs).length > 0) {
        return;
      }
      await fsp.rmdir(abs);
      dir = path.dirname(dir);
    }
  }
}

function normalize(file: string): string {
  return file
    .replace(/\\/g, '/')
    .replace(/^\.(\/|$)/, '')
    .replace(/\/$/, '');
}
