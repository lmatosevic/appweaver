import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Updates skill files and AI guidelines in the project by copying the skill directory
 * to specified agent directories and updating references in guideline files.
 *
 * @param {boolean} quiet - If true, suppresses logging output; otherwise, logs actions performed.
 * @param {boolean} updateSkill - If true, copies skill files into agent directories (e.g. .claude, .agents).
 * @param {boolean} updateGuidelines - If true, updates AI guideline files (e.g. AGENTS.md, CLAUDE.md).
 * @return {Promise<void>} A promise that resolves when the update process is complete.
 */
export async function updateSkillFiles(
  quiet: boolean,
  updateSkill = true,
  updateGuidelines = true
): Promise<void> {
  if (!updateSkill && !updateGuidelines) {
    return;
  }

  const projectDir = process.cwd();
  const skillDir = path.join(__dirname, '..', 'skill');

  if (!(await exists(skillDir))) {
    if (!quiet) {
      console.warn('Skill directory not found, skipping skill file update.\n');
    }
    return;
  }

  const guidelinesFilePath = path.join(skillDir, 'GUIDELINES.md');
  const guidelinesContents = await fsp.readFile(guidelinesFilePath, 'utf8');

  const foundAgentDirs: string[] = [];

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

    foundAgentDirs.push(agentDir);

    // Skip copying skill files when disabled, but keep the discovered agent
    // dir so guideline references can still point to it.
    if (!updateSkill) {
      continue;
    }

    // Copy skill directory to {agentDir}/skills/appweaver/
    const skillDestPath = path.join(agentDirPath, 'skills', 'appweaver');
    await fsp.cp(skillDir, skillDestPath, {
      recursive: true,
      filter: (src) => !src.endsWith('GUIDELINES.md')
    });

    if (!quiet) {
      console.log(
        `Updated skill files in ${path.join(agentDir, 'skills', 'appweaver')}\n`
      );
    }
  }

  // Nothing more to do when guideline files should not be updated
  if (!updateGuidelines) {
    return;
  }

  let firstAgentDir: string | undefined = foundAgentDirs[0];

  for (const guidelinesFile of ['AGENTS.md', 'CLAUDE.md']) {
    const guidelinesFilePath = path.join(projectDir, guidelinesFile);

    // Update only agent guidelines files that already exist
    if (!(await exists(guidelinesFilePath))) {
      continue;
    }

    // If no agent-specific dir was discovered, fall back to a generic .agents
    // dir and, unless skill updates are disabled, populate it with skill files.
    if (!firstAgentDir) {
      firstAgentDir = '.agents';
      if (updateSkill) {
        const skillDestPath = path.join(
          path.join(projectDir, firstAgentDir),
          'skills',
          'appweaver'
        );
        await fsp.cp(skillDir, skillDestPath, {
          recursive: true,
          filter: (src) => !src.endsWith('GUIDELINES.md')
        });
      }
    }

    // Replace guideline file path references with path references in first
    // discovered agents dir
    const referencesPath = path
      .join(firstAgentDir, 'skills', 'appweaver', 'references')
      .replace(/\\/g, '/');
    const guidelinesContent = guidelinesContents.replace(
      /(\[.+]\()references\/(.+\))/g,
      `$1${referencesPath}/$2`
    );

    await fsp.writeFile(guidelinesFilePath, guidelinesContent, {
      encoding: 'utf8'
    });

    if (!quiet) {
      console.log(`Updated AI guidelines file ${guidelinesFile}\n`);
    }

    // Update only the first found guidelines file
    break;
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
