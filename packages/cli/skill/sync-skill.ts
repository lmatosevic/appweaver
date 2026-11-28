import type * as SkillPackage from '@appweaver/skill';

/**
 * Copies the skill files of the project's `@appweaver/skill` into the `skills/appweaver/` of its agent directories
 * (`.claude`, `.agents`, ...), so the skill matches the installed framework version.
 *
 * @param {string} projectDir - The root directory of the project.
 * @param {Object} [options] - `quiet` prints nothing but the warnings, `dryRun` prints the directories without writing.
 * @return {Promise<boolean>} `false` when the project does not have `@appweaver/skill`.
 */
export async function syncProjectSkill(
  projectDir: string,
  options: { quiet?: boolean; dryRun?: boolean } = {}
): Promise<boolean> {
  const skill = await loadSkillPackage();
  if (!skill) {
    console.warn(
      'The project does not have the @appweaver/skill package, install it with: npm install --save-dev @appweaver/skill'
    );
    return false;
  }

  if (options.dryRun) {
    const targets = skill.AGENT_DIRS.filter((dir) =>
      skill.hasAgentDir(projectDir, dir)
    );
    console.log(
      targets.length > 0
        ? `Skill files that would be written:\n${targets.map((dir) => `  ${dir}/skills/${skill.SKILL_NAME}`).join('\n')}`
        : 'No agent directory found.'
    );
    return true;
  }

  const written = skill.syncSkill(projectDir);
  if (!options.quiet) {
    console.log(
      written.length > 0
        ? written.map((dir) => `Updated skill files in ${dir}`).join('\n')
        : `No agent directory found (${skill.AGENT_DIRS.join(', ')}).`
    );
  }
  return true;
}

/** Loads the `@appweaver/skill` of the project, which the CLI resolves beside itself. */
async function loadSkillPackage(): Promise<typeof SkillPackage | undefined> {
  try {
    return await import('@appweaver/skill');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}
