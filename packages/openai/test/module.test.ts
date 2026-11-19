import path from 'node:path';
import { sourceLoggerNames } from '@appweaver/testing';
import manifest from '../module';

describe('module', () => {
  test('lists every logger of the package', () => {
    expect([...(manifest.loggers ?? [])].sort()).toEqual(
      sourceLoggerNames(path.join(__dirname, '..'))
    );
  });

  test('provides the openai driver of the AI endpoints', async () => {
    const [provider] = manifest.providers ?? [];

    expect(provider).toMatchObject({ name: 'openai' });
    expect(provider.contract.name).toBe('AiDriver');
    expect(await provider.load()).toHaveProperty('OpenAiDriver');
    expect(manifest.requires).toEqual(['@appweaver/ai']);
  });
});
