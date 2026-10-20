/** A commented block of COPY instructions of the Dockerfile deploy stage. */
export type DockerfileBlock = {
  /** The comment opening the block, without the `# `. */
  comment: string;
  instructions: string[];
  /** The comments of the blocks it is inserted before, the first one found. */
  before: string[];
};

/**
 * Inserts a commented block of instructions into a Dockerfile, before the first block of `before` it contains.
 *
 * @param {string} content - The Dockerfile content.
 * @param {DockerfileBlock} block - The block to insert.
 * @return {string | undefined} The Dockerfile content with the block, the same content if it already has it, or
 * `undefined` if none of the blocks to insert it before is found.
 */
export function addDockerfileBlock(
  content: string,
  block: DockerfileBlock
): string | undefined {
  if (content.includes(`# ${block.comment}\n`)) {
    return content;
  }

  const anchor = block.before
    .map((comment) => content.indexOf(`# ${comment}`))
    .find((index) => index >= 0);
  if (anchor === undefined) {
    return undefined;
  }

  const text = `# ${block.comment}\n${block.instructions.join('\n')}\n\n`;
  return content.slice(0, anchor) + text + content.slice(anchor);
}

/**
 * Removes a commented block of instructions from a Dockerfile, up to the empty line ending it.
 *
 * @param {string} content - The Dockerfile content.
 * @param {string} comment - The comment opening the block, without the `# `.
 * @return {string} The Dockerfile content without the block.
 */
export function removeDockerfileBlock(
  content: string,
  comment: string
): string {
  const escaped = comment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.replace(new RegExp(`# ${escaped}\n([^#\n].*\n)+\n`), '');
}
