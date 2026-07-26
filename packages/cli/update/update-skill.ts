import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Updates the Appweaver skill files in the project by copying the skill
 * directory (including the framework GUIDELINES.md) into every discovered agent
 * directory (e.g. `.claude`, `.agents`).
 *
 * The project's own root guidelines file (`AGENTS.md` / `CLAUDE.md`) is never
 * touched here — it only references the framework guidelines from the skills
 * directory, so it can be freely extended in the project.
 *
 * @param {boolean} quiet - If true, suppresses logging output; otherwise, logs actions are performed.
 * @return {Promise<void>} A promise that resolves when the update process is complete.
 */
export async function updateSkillFiles(quiet: boolean): Promise<void> {
  const projectDir = process.cwd();
  const skillDir = path.join(__dirname, '..', 'skill');

  if (!(await exists(skillDir))) {
    if (!quiet) {
      console.warn('Skill directory not found, skipping skill file update.\n');
    }
    return;
  }

  for (const agentDir of [
    '.claude',
    '.junie',
    '.kiro',
    '.pi',
    '.github',
    '.opencode',
    '.agents'
  ]) {
    const agentDirPath = path.join(projectDir, agentDir);

    if (!(await exists(agentDirPath))) {
      continue;
    }

    // Copy skill directory to {agentDir}/skills/appweaver/
    const skillDestPath = path.join(agentDirPath, 'skills', 'appweaver');
    await fsp.cp(skillDir, skillDestPath, { recursive: true });

    if (!quiet) {
      console.log(
        `Updated skill files in ${path.join(agentDir, 'skills', 'appweaver')}\n`
      );
    }
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
