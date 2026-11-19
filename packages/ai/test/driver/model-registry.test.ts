import {
  AiError,
  ConfigurationError,
  configOverrides,
  defineModule
} from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { resetContext } from '@appweaver/testing';
import {
  AiDriver,
  ModelRegistry,
  MockAiDriver,
  registerAiDriver
} from '../../index';
import { clearAiOverrides, ScriptedDriver } from '../fixtures';

describe('model-registry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    resetContext();
    registry = new ModelRegistry();
  });

  afterEach(() => {
    clearAiOverrides();
    delete process.env.OPENROUTER_API_KEY;
  });

  describe('resolve', () => {
    test('splits a reference at its first colon', () => {
      expect(registry.resolve('local:qwen3:8b')).toEqual([
        { reference: 'local:qwen3:8b', endpoint: 'local', model: 'qwen3:8b' }
      ]);
    });

    test('resolves an alias into its references, a string listing them too', () => {
      configOverrides.AI_ALIASES = {
        smart: ['a:one', 'b:two'],
        fast: 'a:one, b:two',
        single: 'a:one'
      };

      expect(registry.resolve('smart').map((model) => model.reference)).toEqual(
        ['a:one', 'b:two']
      );
      expect(registry.resolve('fast').map((model) => model.reference)).toEqual([
        'a:one',
        'b:two'
      ]);
      expect(registry.resolve('single')).toHaveLength(1);
    });

    test('takes the default model', () => {
      configOverrides.AI_DEFAULT_MODEL = 'mock:echo';

      expect(registry.resolve(undefined)[0].reference).toBe('mock:echo');
    });

    test.each([
      [undefined, 'No model given'],
      ['unknown', "Unknown AI model 'unknown'"],
      ['bad', 'must list model references'],
      ['empty', 'must list model references'],
      [':model', 'Invalid AI model reference'],
      ['endpoint:', 'Invalid AI model reference']
    ])('rejects the model %s', (model, message) => {
      configOverrides.AI_ALIASES = { bad: ['a:one', 'nested'], empty: [] };

      expect(() => registry.resolve(model)).toThrow(message);
      expect(() => registry.resolve(model)).toThrow(AiError);
    });
  });

  describe('endpoint', () => {
    test('completes an endpoint with its preset and the config', () => {
      process.env.OPENROUTER_API_KEY = 'sk-env';
      configOverrides.AI_ENDPOINTS = {
        router: { preset: 'openrouter', headers: ['X-Title: Shop', 'broken'] },
        local: {
          preset: 'ollama',
          baseUrl: 'http://ollama:11434/v1',
          timeout: 1000
        },
        custom: { baseUrl: 'http://vllm/v1', apiKey: 'key', maxRetries: 0 }
      };

      expect(registry.endpoint('router')).toMatchObject({
        name: 'router',
        driver: 'openai',
        preset: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'sk-env',
        headers: { 'X-Title': 'Shop' },
        options: { reasoningParam: 'reasoning' },
        timeout: 120000,
        maxRetries: 2
      });
      expect(registry.endpoint('local')).toMatchObject({
        baseUrl: 'http://ollama:11434/v1',
        apiKey: undefined,
        timeout: 1000,
        capabilities: expect.not.arrayContaining(['files'])
      });
      expect(registry.endpoint('custom')).toMatchObject({
        driver: 'openai',
        apiKey: 'key',
        maxRetries: 0,
        capabilities: expect.arrayContaining(['files', 'embeddings'])
      });
    });

    test('has the built-in mock endpoint', () => {
      expect(registry.endpoint('mock')).toMatchObject({ driver: 'mock' });
    });

    test('rejects an unknown endpoint or preset', () => {
      configOverrides.AI_ENDPOINTS = { odd: { preset: 'nope' } };

      expect(() => registry.endpoint('missing')).toThrow(
        "No AI endpoint 'missing' configured"
      );
      expect(() => registry.endpoint('odd')).toThrow(ConfigurationError);
    });
  });

  describe('driver', () => {
    test('creates the driver of an endpoint once', async () => {
      const driver = await registry.driver('mock');

      expect(driver).toBeInstanceOf(MockAiDriver);
      expect(await registry.driver('mock')).toBe(driver);
    });

    test('creates a registered driver', async () => {
      registerAiDriver('scripted', ScriptedDriver);
      configOverrides.AI_ENDPOINTS = { main: { driver: 'scripted' } };

      expect(await registry.driver('main')).toBeInstanceOf(ScriptedDriver);
    });

    test('creates the driver a module provides', async () => {
      class ModuleDriver extends ScriptedDriver {}
      context.modules.enabled.push(
        defineModule({
          name: 'drivers',
          providers: [
            {
              contract: AiDriver,
              name: 'module',
              load: async () => ({ helper: () => 1, ModuleDriver })
            }
          ]
        })
      );
      configOverrides.AI_ENDPOINTS = { main: { driver: 'module' } };

      expect(await registry.driver('main')).toBeInstanceOf(ModuleDriver);
    });

    test('names the package of a missing driver, and retries it', async () => {
      configOverrides.AI_ENDPOINTS = {
        local: { preset: 'ollama' },
        other: { driver: 'unknown' }
      };

      await expect(registry.driver('local')).rejects.toThrow(
        'install @appweaver/openai'
      );
      await expect(registry.driver('other')).rejects.toThrow(
        "No enabled module provides the AI driver 'unknown'"
      );
      registerAiDriver('openai', ScriptedDriver);
      try {
        expect(await registry.driver('local')).toBeInstanceOf(ScriptedDriver);
      } finally {
        registerAiDriver('openai', undefined);
      }
    });

    test('requires the API key of a preset needing one', async () => {
      configOverrides.AI_ENDPOINTS = { openRouter: { preset: 'openrouter' } };

      await expect(registry.driver('openRouter')).rejects.toThrow(
        'AI_ENDPOINTS_OPEN_ROUTER_API_KEY) or OPENROUTER_API_KEY'
      );
    });
  });

  describe('validate', () => {
    test('lists the models naming unknown endpoints', () => {
      configOverrides.AI_DEFAULT_MODEL = 'nowhere:model';
      configOverrides.AI_DEFAULT_EMBEDDING_MODEL = 'mock:embed';
      configOverrides.AI_ALIASES = { fast: 'mock:echo', broken: 'x:y' };

      expect(registry.validate()).toEqual([
        expect.stringContaining("No AI endpoint 'nowhere'"),
        expect.stringContaining("No AI endpoint 'x'")
      ]);
    });
  });
});
