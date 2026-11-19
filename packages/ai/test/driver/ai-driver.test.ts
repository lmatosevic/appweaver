import { ErrorCode } from '@appweaver/common';
import { ModelRegistry } from '../../index';
import { ScriptedDriver } from '../fixtures';

describe('ai-driver', () => {
  test('has no embeddings by default', async () => {
    const driver = new ScriptedDriver(new ModelRegistry().endpoint('mock'));

    await expect(
      driver.embed({ model: 'm', input: ['a'] })
    ).rejects.toMatchObject({
      code: ErrorCode.AiCapabilityUnsupported
    });
  });
});
