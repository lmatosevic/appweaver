import {
  addDockerfileBlock,
  DockerfileBlock,
  removeDockerfileBlock
} from '../../scaffold/dockerfile-util';

const dockerfile =
  '# Copy public static files\nCOPY --from=build /usr/app/public /usr/app/public\n\n' +
  '# Copy Prisma config\nCOPY --from=build /usr/app/prisma.config.ts /usr/app/prisma.config.ts\n\n' +
  '# Copy start script\nCOPY --from=build /usr/app/start.sh /usr/app/start.sh\n';

const block: DockerfileBlock = {
  comment: 'Copy templates',
  instructions: ['COPY --from=build /usr/app/templates /usr/app/templates'],
  before: ['Copy translation files', 'Copy Prisma config']
};

describe('dockerfile-util', () => {
  describe('addDockerfileBlock', () => {
    test('inserts the block before the first block found', () => {
      expect(addDockerfileBlock(dockerfile, block)).toBe(
        '# Copy public static files\nCOPY --from=build /usr/app/public /usr/app/public\n\n' +
          '# Copy templates\nCOPY --from=build /usr/app/templates /usr/app/templates\n\n' +
          '# Copy Prisma config\nCOPY --from=build /usr/app/prisma.config.ts /usr/app/prisma.config.ts\n\n' +
          '# Copy start script\nCOPY --from=build /usr/app/start.sh /usr/app/start.sh\n'
      );
    });

    test('keeps a Dockerfile that has the block', () => {
      const content = addDockerfileBlock(dockerfile, block)!;

      expect(addDockerfileBlock(content, block)).toBe(content);
    });

    test('returns nothing without a block to insert it before', () => {
      expect(addDockerfileBlock('FROM node\n', block)).toBeUndefined();
    });
  });

  describe('removeDockerfileBlock', () => {
    test('removes the block up to its empty line', () => {
      const content = addDockerfileBlock(dockerfile, block)!;

      expect(removeDockerfileBlock(content, 'Copy templates')).toBe(dockerfile);
      expect(removeDockerfileBlock(dockerfile, 'Copy templates')).toBe(
        dockerfile
      );
    });
  });
});
