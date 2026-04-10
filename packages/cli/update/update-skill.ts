import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

type AgentDirEntry = {
  dir: string;
  guidelinesFile: string;
};

const agentDirMapping: AgentDirEntry[] = [
  { dir: '.claude', guidelinesFile: 'CLAUDE.md' },
  { dir: '.junie', guidelinesFile: 'AGENTS.md' },
  { dir: '.kiro', guidelinesFile: 'AGENTS.md' },
  { dir: '.pi', guidelinesFile: 'AGENTS.md' },
  { dir: '.opencode', guidelinesFile: 'AGENTS.md' },
  { dir: '.github', guidelinesFile: 'AGENTS.md' },
  { dir: '.agents', guidelinesFile: 'AGENTS.md' }
];

async function exists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function updateSkillFiles(quiet: boolean): Promise<void> {
  const projectDir = process.cwd();
  const skillDir = path.join(__dirname, '..', 'skill');

  if (!(await exists(skillDir))) {
    if (!quiet) {
      console.warn('Skill directory not found, skipping skill file update.');
    }
    return;
  }

  const skillFilePath = path.join(skillDir, 'SKILL.md');
  const skillFileContents = await fsp.readFile(skillFilePath, 'utf8');

  const writtenGuidelinesFiles = new Set<string>();
  let anyAgentDirFound = false;

  for (const { dir, guidelinesFile } of agentDirMapping) {
    const agentDirPath = path.join(projectDir, dir);

    if (!(await exists(agentDirPath))) {
      continue;
    }

    anyAgentDirFound = true;

    // Copy skill directory to {agentDir}/skills/appweaver/
    const skillDestPath = path.join(agentDirPath, 'skills', 'appweaver');
    await fsp.cp(skillDir, skillDestPath, { recursive: true });

    if (!quiet) {
      console.log(
        `Updated skill files in ${path.join(dir, 'skills', 'appweaver')}`
      );
    }

    // Write guidelines file once per unique filename
    if (!writtenGuidelinesFiles.has(guidelinesFile)) {
      writtenGuidelinesFiles.add(guidelinesFile);

      const referencesPath = path
        .join(dir, 'skills', 'appweaver', 'references')
        .replace(/\\/g, '/');

      const guidelinesContent = skillFileContents
        .replace(/references\//g, `${referencesPath}/`)
        .replace(/^---[\s\S]+?\n---\n\n/g, '')
        .replace('# Appweaver skill', '# Appweaver project guidelines');

      const guidelinesFilePath = path.join(projectDir, guidelinesFile);
      await fsp.writeFile(guidelinesFilePath, guidelinesContent, {
        encoding: 'utf8'
      });

      if (!quiet) {
        console.log(`Updated AI guidelines file ${guidelinesFile}`);
      }
    }
  }

  // If no agent directories were found, fall back to updating root CLAUDE.md or AGENTS.md
  if (!anyAgentDirFound) {
    const guidelinesContent = skillFileContents
      .replace(/^---[\s\S]+?\n---\n\n/g, '')
      .replace('# Appweaver skill', '# Appweaver project guidelines');

    for (const guidelinesFile of ['CLAUDE.md', 'AGENTS.md']) {
      const guidelinesFilePath = path.join(projectDir, guidelinesFile);
      if (await exists(guidelinesFilePath)) {
        await fsp.writeFile(guidelinesFilePath, guidelinesContent, {
          encoding: 'utf8'
        });
        if (!quiet) {
          console.log(`Updated ${guidelinesFile}`);
        }
        break;
      }
    }
  }
}
