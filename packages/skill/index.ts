import fs from 'node:fs';
import path from 'node:path';

/** The directories of the AI agents a project may have, each holding its skills in `skills/`. */
export const AGENT_DIRS = [
  '.claude',
  '.junie',
  '.kiro',
  '.pi',
  '.github',
  '.opencode',
  '.agents'
] as const;

/** The name of the skill directory in the `skills/` of an agent directory. */
export const SKILL_NAME = 'appweaver';

/**
 * The directory of the skill files (`SKILL.md`, `GUIDELINES.md` and `references/`): the `skill/` of the published
 * package, or the `skill/` of the repository when running from the sources.
 *
 * @return {string} The absolute path of the skill directory.
 */
export function skillDir(): string {
  const published = path.join(__dirname, 'skill');
  return fs.existsSync(published)
    ? published
    : path.join(__dirname, '..', '..', 'skill');
}

/**
 * Checks if a project has an agent directory.
 *
 * @param {string} projectDir - The root directory of the project.
 * @param {string} agentDir - The agent directory, relative to the project (`.claude`).
 * @return {boolean} `true` when the directory exists.
 */
export function hasAgentDir(projectDir: string, agentDir: string): boolean {
  return fs.existsSync(path.join(projectDir, agentDir));
}

/**
 * Copies the skill files into the `skills/appweaver/` of the agent directories of a project, replacing the files of an
 * older version. The project's own `AGENTS.md` or `CLAUDE.md` is never touched.
 *
 * @param {string} projectDir - The root directory of the project.
 * @param {string[]} [agentDirs] - The agent directories to write to, relative to the project; by default the ones of
 * `AGENT_DIRS` the project has.
 * @return {string[]} The skill directories written, relative to the project.
 */
export function syncSkill(projectDir: string, agentDirs?: string[]): string[] {
  const targets =
    agentDirs ?? AGENT_DIRS.filter((dir) => hasAgentDir(projectDir, dir));
  const source = skillDir();

  return targets.map((agentDir) => {
    const target = path.join(agentDir, 'skills', SKILL_NAME);
    const absolute = path.join(projectDir, target);
    // A reference removed from the skill must not linger in the project
    fs.rmSync(absolute, { recursive: true, force: true });
    fs.cpSync(source, absolute, { recursive: true });
    return target;
  });
}
