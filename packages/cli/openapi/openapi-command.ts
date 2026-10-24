import path from 'node:path';
import fsp from 'node:fs/promises';
import { Command, InvalidOptionArgumentError } from 'commander';
import { createApp, inject, isDefined } from '@appweaver/core';
import { ensureDirExists } from '../utils';

const formats = ['json', 'yaml'];

/**
 * Registers the `openapi` command, generating the OpenAPI specification of the application.
 *
 * @param {Command} program - The program to register the command on.
 */
export function openapiCommand(program: Command): void {
  program
    .command('openapi')
    .alias('oa')
    .description("Generate application's OpenAPI specification schema.")
    .option(
      '-o, --output-path [path]',
      'Output path for generated OpenAPI specification.',
      './openapi.json'
    )
    .option(
      '-f, --format [format]',
      `Output format for generated OpenAPI specification (${formats.join(', ')}).`,
      parseFormat,
      'json'
    )
    .action(async (_, command: Command) => {
      const format = command.getOptionValue('format');
      const rawOutputPath = command.getOptionValue('outputPath');
      const outputPath =
        rawOutputPath === './openapi.json' && format === 'yaml'
          ? './openapi.yaml'
          : rawOutputPath;

      try {
        const app = await createApp({ autoStart: false });

        if (!isDefined('HttpServer')) {
          console.error(
            'weaver openapi needs the @appweaver/web module, which is disabled'
          );
          process.exit(1);
        }

        const spec = await inject<{
          spec(format: string): Promise<string>;
        }>('HttpServer').spec(format);

        await ensureDirExists(outputPath);

        await fsp.writeFile(outputPath, spec, 'utf8');

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

function parseFormat(value: string): string {
  const lowerFormat = value.toLowerCase();
  if (!formats.includes(lowerFormat)) {
    throw new InvalidOptionArgumentError(
      `Must be one of following: ${formats.join(', ')}.`
    );
  }

  return lowerFormat;
}
