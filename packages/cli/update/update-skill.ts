import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export async function updateSkillFiles(quiet: boolean): Promise<void> {
  const projectDir = process.cwd();
  const skillDir = path.join(__dirname, '..', 'skill');

  if (!(await exists(skillDir))) {
    if (!quiet) {
      console.warn('Skill directory not found, skipping skill file update.\n');
    }
    return;
  }

  const skillFilePath = path.join(skillDir, 'SKILL.md');
  const skillFileContents = await fsp.readFile(skillFilePath, 'utf8');

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

    // Copy skill directory to {agentDir}/skills/appweaver/
    const skillDestPath = path.join(agentDirPath, 'skills', 'appweaver');
    await fsp.cp(skillDir, skillDestPath, { recursive: true });

    if (!quiet) {
      console.log(
        `Updated skill files in ${path.join(agentDir, 'skills', 'appweaver')}\n`
      );
    }
  }

  let firstAgentDir: string | undefined = foundAgentDirs[0];

  for (const guidelinesFile of ['AGENTS.md', 'CLAUDE.md']) {
    const guidelinesFilePath = path.join(projectDir, guidelinesFile);

    // Update only agent guidelines files that already exist
    if (!(await exists(guidelinesFilePath))) {
      continue;
    }

    // If no agent-specific dir was discovered, create new generic .agents dir
    if (!firstAgentDir) {
      firstAgentDir = '.agents';
      const skillDestPath = path.join(
        path.join(projectDir, firstAgentDir),
        'skills',
        'appweaver'
      );
      await fsp.cp(skillDir, skillDestPath, { recursive: true });
    }

    // Replace guideline file path references with path references in first
    // discovered agents dir
    const referencesPath = path
      .join(firstAgentDir, 'skills', 'appweaver', 'references')
      .replace(/\\/g, '/');

    // Remove skill YAML header and change to guideline title
    const guidelinesContent = skillFileContents
      .replace(/references\//g, `${referencesPath}/`)
      .replace(/^---[\s\S]+?\n---\n\n/g, '')
      .replace('# Appweaver skill', '# Appweaver project guidelines');

    await fsp.writeFile(guidelinesFilePath, guidelinesContent, {
      encoding: 'utf8'
    });

    if (!quiet) {
      console.log(`Updated AI guidelines file ${guidelinesFile}\n`);
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
