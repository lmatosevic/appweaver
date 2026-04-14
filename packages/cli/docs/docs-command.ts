import path from 'node:path';
import fsp from 'node:fs/promises';
import { Command } from 'commander';
import { createApp } from '@appweaver/core';
import { ensureDirExists } from '../utils';

export function docsCommand(program: Command): void {
  program
    .command('docs')
    .description('Generate application OpenAPI specification schema.')
    .option(
      '-o, --outputPath [path]',
      'Output path for generated OpenAPI specification.',
      './schema.json'
    )
    .action(async (_, command: Command) => {
      const outputPath = command.getOptionValue('outputPath');

      try {
        const app = await createApp({ autoStart: false });

        const docs = await app.docs();

        await ensureDirExists(outputPath);

        await fsp.writeFile(outputPath, docs, 'utf8');

        console.log(
          `Schema generated to ${path.relative(process.cwd(), outputPath)}`
        );

        process.exit(0);
      } catch (error) {
        console.error('Schema generation failed', error);
        process.exit(1);
      }
    });
}
