import { Type } from '@sinclair/typebox';
import {
  AiError,
  configOverrides,
  ConfigurationError,
  createLogger,
  ErrorCode,
  PubSub,
  Queue,
  TemplateEngine,
  withSpan
} from '@appweaver/common';
import { define } from '@appweaver/core';
import { MemoryPubSub, MemoryQueue } from '@appweaver/core/drivers';
import {
  recordTelemetry,
  resetContext,
  TelemetryRecorder
} from '@appweaver/testing';
import {
  AiService,
  AiStreamPart,
  createAiTool,
  mockAiResponse
} from '../../index';
import {
  clearAiOverrides,
  ScriptedDriver,
  useScriptedEndpoints
} from '../fixtures';

const logger = createLogger('ai');

describe('ai-service', () => {
  let queue: MemoryQueue;
  let queues: MemoryQueue[] = [];
  let ai: AiService;

  /** Creates the service with the given context. */
  function createService(
    options: { queue?: boolean; pubsub?: boolean; engine?: object } = {}
  ): AiService {
    resetContext();
    // A queue per service, so a replaced service runs no worker
    queue = new MemoryQueue();
    queues.push(queue);
    if (options.queue !== false) {
      define(queue, Queue);
    }
    if (options.pubsub) {
      define(new MemoryPubSub(), PubSub);
    }
    if (options.engine) {
      define(options.engine, TemplateEngine as any);
    }
    return new AiService();
  }

  beforeEach(() => {
    useScriptedEndpoints();
    jest.spyOn(logger, 'warn').mockImplementation();
    ai = createService();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    mockAiResponse(undefined);
    clearAiOverrides();
    await Promise.all(queues.map((created) => created.closeAll()));
    queues = [];
  });

  afterAll(() => {
    resetContext();
  });

  describe('onInit', () => {
    test('accepts a valid config', async () => {
      await expect(ai.onInit()).resolves.toBeUndefined();
    });

    test('rejects an alias of an unknown endpoint', async () => {
      configOverrides.AI_ALIASES = { fast: 'nowhere:model' };

      await expect(ai.onInit()).rejects.toThrow(ConfigurationError);
    });
  });

  describe('generate', () => {
    test('calls the default model with the system prompt and the prompt', async () => {
      ScriptedDriver.answers.push({ text: 'Paris', id: 'r1' });

      const result = await ai.generate({
        system: 'Answer briefly.',
        prompt: 'Capital of France?',
        maxTokens: 20
      });

      expect(result).toMatchObject({
        text: 'Paris',
        model: 'main:model-a',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
      });
      expect(result.messages).toEqual([
        { role: 'system', content: 'Answer briefly.' },
        { role: 'user', content: 'Capital of France?' },
        { role: 'assistant', content: 'Paris' }
      ]);
      expect(ScriptedDriver.requests[0]).toMatchObject({
        endpoint: 'main',
        request: { model: 'model-a', maxTokens: 20 }
      });
    });

    test('takes the defaults of the config', async () => {
      configOverrides.AI_MAX_TOKENS = 100;
      configOverrides.AI_TEMPERATURE = 0.2;

      await ai.generate({ prompt: 'Hi', model: 'backup:model-b' });

      expect(ScriptedDriver.requests[0]).toMatchObject({
        endpoint: 'backup',
        request: { model: 'model-b', maxTokens: 100, temperature: 0.2 }
      });
    });

    test('rejects a prompt without messages', async () => {
      await expect(ai.generate({})).rejects.toMatchObject({
        code: ErrorCode.AiRequestInvalid
      });
    });

    test('rejects an unknown model', async () => {
      await expect(
        ai.generate({ model: 'smart', prompt: 'Hi' })
      ).rejects.toMatchObject({
        code: ErrorCode.AiModelUnknown
      });
    });

    test('calls the next model of an alias on a retriable error', async () => {
      ScriptedDriver.answers.push(
        new AiError(ErrorCode.AiRateLimited, 'Slow down', {
          model: 'main:model-a',
          endpoint: 'main'
        }),
        { text: 'From the backup' }
      );

      const result = await ai.generate({ model: 'failover', prompt: 'Hi' });

      expect(result).toMatchObject({
        text: 'From the backup',
        model: 'backup:model-b'
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    test('throws an error another model would not avoid', async () => {
      ScriptedDriver.answers.push(
        new AiError(ErrorCode.AiAuthFailed, 'Bad key', {
          model: 'main:model-a',
          endpoint: 'main'
        })
      );

      await expect(
        ai.generate({ model: 'failover', prompt: 'Hi' })
      ).rejects.toMatchObject({ code: ErrorCode.AiAuthFailed });
      expect(ScriptedDriver.requests).toHaveLength(1);
    });

    test('rejects a request the model cannot serve', async () => {
      await expect(
        ai.generate({
          model: 'limited:model',
          prompt: [{ type: 'image', url: 'https://example.com/cat.png' }]
        })
      ).rejects.toMatchObject({
        code: ErrorCode.AiCapabilityUnsupported,
        details: { capability: 'images' }
      });
      await expect(
        ai.generate({
          model: 'limited:model',
          prompt: [{ type: 'file', mimeType: 'application/pdf', data: 'AA' }],
          reasoning: 'low',
          responseFormat: { type: 'json' }
        })
      ).rejects.toMatchObject({ details: { capability: 'json' } });
      await expect(
        ai.generate({ model: 'limited:model', prompt: 'Hi', reasoning: 'low' })
      ).rejects.toMatchObject({ details: { capability: 'reasoning' } });
    });

    test('renders the prompt templates', async () => {
      const engine = {
        hasTemplate: jest.fn(async () => true),
        render: jest.fn(
          async (name: string, data: any) => ` ${name}: ${data.topic} `
        )
      };
      ai = createService({ engine });

      const result = await ai.generate({
        system: { template: 'prompts/system.txt', data: { topic: 'a' } },
        prompt: { template: 'prompts/ask', data: { topic: 'b' }, locale: 'de' }
      });

      expect(result.messages.slice(0, 2)).toEqual([
        { role: 'system', content: 'prompts/system.txt: a' },
        { role: 'user', content: 'prompts/ask.md: b' }
      ]);
      expect(engine.render).toHaveBeenCalledWith(
        'prompts/ask.md',
        { topic: 'b' },
        { locale: 'de' }
      );
    });

    test('rejects a missing template, or one without an engine', async () => {
      await expect(
        ai.generate({ prompt: { template: 'prompts/ask' } })
      ).rejects.toThrow(ConfigurationError);

      ai = createService({
        engine: { hasTemplate: async () => false, render: jest.fn() }
      });
      await expect(
        ai.generate({ prompt: { template: 'prompts/ask' } })
      ).rejects.toMatchObject({ code: ErrorCode.TemplateNotFound });
    });
  });

  describe('tools', () => {
    const weather = () =>
      createAiTool({
        name: 'getWeather',
        description: 'The weather of a city',
        parameters: Type.Object({
          city: Type.String(),
          unit: Type.String({ default: 'C' })
        }),
        execute: async ({ city, unit }) => ({ city, unit, degrees: 21 })
      });

    test('runs the tools the model calls and calls it again with their results', async () => {
      const tool = weather();
      ScriptedDriver.answers.push(
        {
          toolCalls: [
            { id: 'c1', name: 'getWeather', arguments: { city: 'Zagreb' } }
          ]
        },
        { text: 'It is 21 degrees.' }
      );

      const result = await ai.generate({ prompt: 'Weather?', tools: [tool] });

      expect(result.text).toBe('It is 21 degrees.');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].toolResults).toEqual([
        {
          type: 'tool-result',
          id: 'c1',
          name: 'getWeather',
          result: { city: 'Zagreb', unit: 'C', degrees: 21 }
        }
      ]);
      expect(result.usage.totalTokens).toBe(30);
      expect(ScriptedDriver.requests[0].request.tools).toEqual([
        {
          name: 'getWeather',
          description: 'The weather of a city',
          parameters: tool.parameters
        }
      ]);
      expect(ScriptedDriver.requests[1].request.messages.slice(-2)).toEqual([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              id: 'c1',
              name: 'getWeather',
              arguments: { city: 'Zagreb' }
            }
          ]
        },
        { role: 'tool', content: result.steps[0].toolResults }
      ]);
    });

    test('finds a tool by its name', async () => {
      weather();
      ScriptedDriver.answers.push({
        text: 'Checking',
        toolCalls: [
          { id: 'c1', name: 'getWeather', arguments: { city: 'Split' } }
        ]
      });

      const result = await ai.generate({
        prompt: 'Weather?',
        tools: ['getWeather'],
        maxSteps: 2
      });

      expect(result.steps).toHaveLength(2);
      expect(ScriptedDriver.requests[1].request.messages[1]).toMatchObject({
        role: 'assistant',
        content: [{ type: 'text', text: 'Checking' }, { type: 'tool-call' }]
      });
    });

    test('rejects an unknown tool name', async () => {
      await expect(
        ai.generate({ prompt: 'Hi', tools: ['missing'] })
      ).rejects.toMatchObject({ code: ErrorCode.AiRequestInvalid });
    });

    test('sends the failures of the calls back to the model', async () => {
      const failing = {
        name: 'failing',
        parameters: Type.Object({ id: Type.Integer() }),
        execute: async () => {
          throw new Error('Database down');
        }
      };
      ScriptedDriver.answers.push(
        {
          toolCalls: [
            { id: 'a', name: 'failing', arguments: { id: 1 } },
            { id: 'b', name: 'failing', arguments: { id: 'x' } },
            { id: 'c', name: 'unknown', arguments: {} }
          ]
        },
        { text: 'Sorry' }
      );

      const result = await ai.generate({ prompt: 'Go', tools: [failing] });

      expect(result.steps[0].toolResults).toEqual([
        expect.objectContaining({
          id: 'a',
          isError: true,
          result: 'The tool failed: Database down'
        }),
        expect.objectContaining({
          id: 'b',
          isError: true,
          result: expect.stringContaining('Invalid arguments')
        }),
        expect.objectContaining({
          id: 'c',
          isError: true,
          result: "Unknown tool 'unknown'"
        })
      ]);
    });

    test('returns the calls of a tool without execute', async () => {
      ScriptedDriver.answers.push({
        toolCalls: [{ id: 'c1', name: 'confirm', arguments: {} }]
      });

      const result = await ai.generate({
        prompt: 'Go',
        tools: [{ name: 'confirm', parameters: Type.Object({}) }]
      });

      expect(result.finishReason).toBe('tool-calls');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.steps).toHaveLength(1);
    });

    test('stops after the last step', async () => {
      const tool = weather();
      ScriptedDriver.answers.push({
        toolCalls: [{ id: 'c1', name: 'getWeather', arguments: { city: 'A' } }]
      });

      const result = await ai.generate({
        prompt: 'Go',
        tools: [tool],
        maxSteps: 1
      });

      expect(result.steps).toHaveLength(1);
      expect(result.finishReason).toBe('tool-calls');
    });
  });

  describe('stream', () => {
    test('streams the text deltas, with the result once it ends', async () => {
      ScriptedDriver.answers.push({
        text: 'Hello there world',
        reasoning: 'Hmm'
      });

      const stream = ai.stream({ prompt: 'Hi' });
      const deltas: string[] = [];
      for await (const delta of stream) {
        deltas.push(delta);
      }

      expect(deltas).toEqual(['Hello ', 'there ', 'world']);
      await expect(stream.result).resolves.toMatchObject({
        text: 'Hello there world',
        reasoning: 'Hmm',
        model: 'main:model-a'
      });
    });

    test('streams the tool calls, their results and the finish', async () => {
      const tool = createAiTool({
        name: 'echo',
        parameters: Type.Object({ value: Type.String() }),
        execute: ({ value }) => value
      });
      ScriptedDriver.answers.push(
        { toolCalls: [{ id: 'c1', name: 'echo', arguments: { value: 'x' } }] },
        { text: 'Done' }
      );

      const parts: AiStreamPart[] = [];
      for await (const part of ai
        .stream({ prompt: 'Go', tools: [tool] })
        .parts()) {
        parts.push(part);
      }

      expect(parts.map((part) => part.type)).toEqual([
        'tool-call',
        'tool-result',
        'text-delta',
        'finish'
      ]);
      expect(parts[1]).toMatchObject({ result: 'x', toolCall: { id: 'c1' } });
      expect(parts[3]).toMatchObject({
        finishReason: 'stop',
        usage: { totalTokens: 30 }
      });
    });

    test('reads the result without iterating', async () => {
      ScriptedDriver.answers.push({ text: 'One two' });

      await expect(ai.stream({ prompt: 'Hi' }).result).resolves.toMatchObject({
        text: 'One two'
      });
      ScriptedDriver.answers.push({ text: 'Three four' });
      await expect(ai.stream({ prompt: 'Hi' }).text()).resolves.toBe(
        'Three four'
      );
    });

    test('streams the next model of an alias failing before streaming', async () => {
      ScriptedDriver.answers.push(
        new AiError(ErrorCode.AiProviderUnavailable, 'Down', {
          model: 'main:model-a',
          endpoint: 'main'
        }),
        { text: 'Backup answer' }
      );

      const stream = ai.stream({ model: 'failover', prompt: 'Hi' });

      await expect(stream.text()).resolves.toBe('Backup answer');
      await expect(stream.result).resolves.toMatchObject({
        model: 'backup:model-b'
      });
    });

    test('fails a stream failing after it streamed', async () => {
      ScriptedDriver.answers.push({ text: 'Partial answer here' });
      ScriptedDriver.streamFailure = {
        after: 1,
        error: new AiError(ErrorCode.AiTimeout, 'Timeout', {
          model: 'main:model-a',
          endpoint: 'main'
        })
      };

      const stream = ai.stream({ model: 'failover', prompt: 'Hi' });

      await expect(stream.text()).rejects.toMatchObject({
        code: ErrorCode.AiTimeout
      });
      await expect(stream.result).rejects.toMatchObject({
        code: ErrorCode.AiTimeout
      });
      expect(ScriptedDriver.requests).toHaveLength(1);
    });

    test('aborts a stream', async () => {
      ScriptedDriver.answers.push({ text: 'A B C D' });
      const controller = new AbortController();
      const stream = ai.stream({ prompt: 'Hi', signal: controller.signal });

      const read = async () => {
        for await (const _ of stream) {
          controller.abort(new Error('Stopped'));
        }
      };

      await expect(read()).rejects.toThrow('Stopped');
      expect(stream.signal.aborted).toBe(true);
    });
  });

  describe('generateObject', () => {
    const City = Type.Object({
      name: Type.String(),
      population: Type.Integer(),
      tags: Type.Array(Type.String(), { default: [] })
    });

    test('asks for the schema in the JSON schema mode', async () => {
      ScriptedDriver.answers.push({
        text: '{"name":"Zagreb","population":800000}'
      });

      const { object } = await ai.generateObject({
        prompt: 'A city',
        schema: City,
        schemaName: 'city'
      });

      expect(object).toEqual({ name: 'Zagreb', population: 800000, tags: [] });
      expect(ScriptedDriver.requests[0].request.responseFormat).toEqual({
        type: 'json-schema',
        schema: City,
        name: 'city'
      });
    });

    test('instructs a model without the JSON schema mode', async () => {
      configOverrides.AI_ENDPOINTS = {
        main: { driver: 'scripted', capabilities: ['json'] },
        plain: { driver: 'scripted', capabilities: [] }
      };
      ScriptedDriver.answers.push(
        { text: '```json\n{"name":"A","population":1}\n```' },
        { text: 'Sure: {"name":"B","population":2} hope it helps' }
      );

      await ai.generateObject({ prompt: 'A city', schema: City });
      const { object } = await ai.generateObject({
        model: 'plain:model',
        prompt: 'A city',
        schema: City
      });

      expect(object).toMatchObject({ name: 'B', population: 2 });
      const [json, plain] = ScriptedDriver.requests.map(
        (entry) => entry.request
      );
      expect(json.responseFormat).toEqual({ type: 'json' });
      expect(json.messages[0]).toMatchObject({
        role: 'system',
        content: expect.stringContaining('JSON Schema')
      });
      expect(plain.responseFormat).toBeUndefined();
    });

    test('repairs an object not matching the schema', async () => {
      ScriptedDriver.answers.push(
        { text: '{"name":"Zagreb","population":"many"}' },
        { text: '{"name":"Zagreb","population":800000}' }
      );

      const result = await ai.generateObject({
        prompt: 'A city',
        schema: City
      });

      expect(result.object.population).toBe(800000);
      expect(result.steps).toHaveLength(2);
      expect(result.usage.totalTokens).toBe(30);
      expect(ScriptedDriver.requests[1].request.messages.at(-1)).toMatchObject({
        role: 'user',
        content: expect.stringContaining('/population')
      });
    });

    test('fails once the repairs run out', async () => {
      ScriptedDriver.answers.push({ text: 'not json' });

      await expect(
        ai.generateObject({ prompt: 'A city', schema: City, repairAttempts: 0 })
      ).rejects.toMatchObject({
        code: ErrorCode.AiOutputInvalid,
        details: {
          model: 'main:model-a',
          errors: [expect.stringContaining('invalid JSON')]
        }
      });
    });
  });

  describe('streamObject', () => {
    const List = Type.Object({ items: Type.Array(Type.String()) });

    test('streams the partial objects, with the object once it ends', async () => {
      ScriptedDriver.answers.push({ text: '{"items": ["a", "b", "c"]}' });

      const stream = ai.streamObject({ prompt: 'List', schema: List });
      const partials: unknown[] = [];
      for await (const partial of stream) {
        partials.push(partial);
      }

      expect(partials[0]).toEqual({});
      expect(partials.at(-1)).toEqual({ items: ['a', 'b', 'c'] });
      await expect(stream.object).resolves.toEqual({ items: ['a', 'b', 'c'] });
      await expect(stream.result).resolves.toMatchObject({
        model: 'main:model-a'
      });
    });

    test('fails an object not matching the schema', async () => {
      ScriptedDriver.answers.push({ text: '{"items": 3}' });

      const stream = ai.streamObject({ prompt: 'List', schema: List });

      await expect(stream.object).rejects.toMatchObject({
        code: ErrorCode.AiOutputInvalid
      });
      stream.abort();
      expect(stream.signal.aborted).toBe(true);
    });
  });

  describe('classify', () => {
    test('returns the label the model picked', async () => {
      ScriptedDriver.answers.push({ text: '{"label":"billing"}' });

      await expect(
        ai.classify('I was charged twice', ['bug', 'billing'], {
          system: 'You triage tickets.'
        })
      ).resolves.toBe('billing');
      expect(ScriptedDriver.requests[0].request.messages[0]).toEqual({
        role: 'system',
        content:
          'You triage tickets.\n\nClassify the input into exactly one of the labels: bug, billing.'
      });
    });

    test('rejects fewer than two labels', async () => {
      await expect(ai.classify('x', ['only'])).rejects.toMatchObject({
        code: ErrorCode.AiRequestInvalid
      });
    });
  });

  describe('embed', () => {
    test('embeds with the default embedding model', async () => {
      configOverrides.AI_DEFAULT_EMBEDDING_MODEL = 'mock:embed';

      const result = await ai.embed(['cat', 'dog'], { dimensions: 4 });

      expect(result.model).toBe('mock:embed');
      expect(result.embeddings).toHaveLength(2);
      expect(result.embeddings[0]).toHaveLength(4);
    });

    test('rejects an endpoint without embeddings', async () => {
      await expect(
        ai.embed('cat', { model: 'limited:model' })
      ).rejects.toMatchObject({
        code: ErrorCode.AiCapabilityUnsupported
      });
      await expect(
        ai.embed('cat', { model: 'main:model' })
      ).rejects.toMatchObject({
        code: ErrorCode.AiCapabilityUnsupported
      });
    });
  });

  describe('supports', () => {
    test('tells the capabilities of a model', async () => {
      await expect(ai.supports('limited:model', 'tools')).resolves.toBe(false);
      await expect(ai.supports(undefined, 'tools')).resolves.toBe(true);
    });
  });

  describe('queue', () => {
    test('runs a call through the queue and waits for its result', async () => {
      ScriptedDriver.answers.push({ text: 'Queued answer' });

      await expect(ai.generateQueued({ prompt: 'Hi' })).resolves.toMatchObject({
        text: 'Queued answer'
      });
    });

    test('adds a call to the queue', async () => {
      const done = new Promise((resolve) =>
        queue.get('ai').onCompleted((_, result) => resolve(result))
      );

      const jobId = await ai.enqueue({ prompt: 'Later' }, { priority: 1 });

      expect(typeof jobId).toBe('string');
      await expect(done).resolves.toMatchObject({ text: 'done' });
    });

    test('rejects with the AI error of a failed job', async () => {
      ScriptedDriver.answers.push(
        new AiError(ErrorCode.AiContextLengthExceeded, 'Too long', {
          model: 'main:model-a',
          endpoint: 'main'
        })
      );

      await expect(
        ai.generateQueued({ prompt: 'Hi' }, { attempts: 1 })
      ).rejects.toMatchObject({ code: ErrorCode.AiContextLengthExceeded });
    });

    test('rejects a queued prompt carrying functions', async () => {
      await expect(
        ai.enqueue({ prompt: 'Hi', tools: [{ name: 'x' } as any] })
      ).rejects.toMatchObject({ code: ErrorCode.AiRequestInvalid });
    });

    test('rejects the queued calls without a queue', async () => {
      ai = createService({ queue: false });

      await expect(ai.enqueue({ prompt: 'Hi' })).rejects.toThrow(
        ConfigurationError
      );
    });

    test('streams a call run by the worker', async () => {
      configOverrides.AI_STREAM_FLUSH_INTERVAL = 1;
      ai = createService({ pubsub: true });
      ScriptedDriver.answers.push({ text: 'Streamed from the worker' });

      const stream = ai.streamQueued({ prompt: 'Hi' });

      await expect(stream.text()).resolves.toBe('Streamed from the worker');
      await expect(stream.result).resolves.toMatchObject({
        text: 'Streamed from the worker'
      });
    });

    test('rejects a queued stream without a pub/sub', async () => {
      await expect(ai.streamQueued({ prompt: 'Hi' }).text()).rejects.toThrow(
        ConfigurationError
      );
    });

    test('fails a queued stream with the error of the job', async () => {
      ai = createService({ pubsub: true });
      ScriptedDriver.answers.push(new Error('Broken driver'));

      await expect(ai.streamQueued({ prompt: 'Hi' }).text()).rejects.toThrow(
        'Broken driver'
      );
    });

    test('aborts the call of the worker with the queued stream', async () => {
      configOverrides.AI_STREAM_FLUSH_INTERVAL = 1;
      ai = createService({ pubsub: true });
      ScriptedDriver.answers.push({ text: 'One two three four five six' });
      const controller = new AbortController();

      const stream = ai.streamQueued(
        { prompt: 'Hi' },
        { signal: controller.signal }
      );
      const read = async () => {
        for await (const _ of stream) {
          controller.abort(new Error('Client gone'));
        }
      };

      await expect(read()).rejects.toThrow('Client gone');
    });
  });

  describe('checkHealth', () => {
    test('checks the configured endpoints', async () => {
      configOverrides.AI_HEALTH_CHECK_ENDPOINTS = ['main', 'mock'];

      await expect(ai.checkHealth()).resolves.toEqual({ success: true });
      expect(ai.checkHealthConfig()).toEqual({ name: 'ai' });
    });

    test('reports the failing endpoints', async () => {
      configOverrides.AI_HEALTH_CHECK_ENDPOINTS = ['main', 'missing'];
      jest
        .spyOn(ScriptedDriver.prototype, 'checkHealth')
        .mockResolvedValue({ success: false });

      const result = await ai.checkHealth();

      expect(result.success).toBe(false);
      expect(result.message).toContain('main: unavailable');
      expect(result.message).toContain("missing: No AI endpoint 'missing'");
    });
  });

  describe('logging', () => {
    test('logs the prompts and the responses when enabled', async () => {
      configOverrides.AI_LOG_PROMPTS = true;
      const debug = jest.spyOn(logger, 'debug').mockImplementation();

      await ai.generate({ prompt: 'Secret question' });

      expect(debug).toHaveBeenCalledWith(
        expect.objectContaining({ messages: expect.any(Array) }),
        'AI request'
      );
      expect(debug).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'done' }),
        'AI call completed'
      );
    });
  });

  describe('with the mock endpoint', () => {
    test('answers with the prompt, or the scripted answers', async () => {
      await expect(
        ai.generate({ model: 'mock:echo', prompt: 'Echo me' })
      ).resolves.toMatchObject({ text: 'Echo me' });

      mockAiResponse(() => 'Scripted');
      await expect(
        ai.generate({ model: 'mock:echo', prompt: 'Echo me' })
      ).resolves.toMatchObject({ text: 'Scripted' });
    });

    test('calls every tool before it answers with their results', async () => {
      const tool = createAiTool({
        name: 'count',
        parameters: Type.Object({ n: Type.Integer() }),
        execute: ({ n }) => n + 1
      });

      const result = await ai.generate({
        model: 'mock:tools',
        prompt: 'Count',
        tools: [tool]
      });

      expect(result.steps).toHaveLength(2);
      expect(result.text).toBe('1');
    });

    test('creates an object of the schema', async () => {
      const { object } = await ai.generateObject({
        model: 'mock:echo',
        prompt: 'Anything',
        schema: Type.Object({ name: Type.String(), count: Type.Integer() })
      });

      expect(object).toEqual({ name: '', count: 0 });
    });
  });

  describe('telemetry', () => {
    let telemetry: TelemetryRecorder;

    beforeEach(() => {
      telemetry = recordTelemetry();
    });

    afterEach(async () => {
      await telemetry.stop();
      delete configOverrides.TELEMETRY_INSTRUMENTATIONS_AI;
    });

    test('traces the model calls and the tool calls, and measures their tokens', async () => {
      const tool = createAiTool({
        name: 'ping',
        parameters: Type.Object({}),
        execute: () => 'pong'
      });
      ScriptedDriver.answers.push(
        {
          toolCalls: [{ id: 'c1', name: 'ping', arguments: {} }],
          id: 'r1',
          model: 'model-a-v2'
        },
        { text: 'pong' }
      );

      await ai.generate({ prompt: 'Ping', tools: [tool], temperature: 0 });

      const chat = telemetry.span('chat model-a');
      expect(chat.attributes).toMatchObject({
        'gen_ai.operation.name': 'chat',
        'gen_ai.provider.name': 'scripted',
        'gen_ai.request.model': 'model-a',
        'gen_ai.request.temperature': 0,
        'gen_ai.response.id': 'r1',
        'gen_ai.response.model': 'model-a-v2',
        'gen_ai.response.finish_reasons': ['tool-calls'],
        'gen_ai.usage.input_tokens': 10,
        'appweaver.ai.endpoint': 'main'
      });
      expect(telemetry.span('execute_tool ping').attributes).toMatchObject({
        'gen_ai.tool.name': 'ping',
        'gen_ai.tool.call.id': 'c1'
      });
      const tokens = await telemetry.metric('gen_ai.client.token.usage');
      expect(tokens?.dataPoints.length).toBeGreaterThan(0);
      expect(
        await telemetry.metric('gen_ai.client.operation.duration')
      ).toBeDefined();
    });

    test('makes the span of the call the parent of the spans of the driver', async () => {
      const generate = ScriptedDriver.prototype.generate;
      jest
        .spyOn(ScriptedDriver.prototype, 'generate')
        .mockImplementation(function (this: ScriptedDriver, ...args) {
          return withSpan('POST', {}, () => generate.apply(this, args));
        });

      await ai.generate({ prompt: 'Hi' });

      expect(telemetry.span('POST').parentSpanContext?.spanId).toBe(
        telemetry.span('chat model-a').spanContext().spanId
      );
    });

    test('records the error of a failed call', async () => {
      ScriptedDriver.answers.push(
        new AiError(ErrorCode.AiTimeout, 'Timeout', {
          model: 'main:model-a',
          endpoint: 'main'
        })
      );

      await expect(ai.generate({ prompt: 'Hi' })).rejects.toThrow();

      expect(telemetry.span('chat model-a').attributes['error.type']).toBe(
        ErrorCode.AiTimeout
      );
    });

    test('traces the embeddings with the server of the endpoint', async () => {
      configOverrides.AI_ENDPOINTS = {
        mock: { preset: 'mock', baseUrl: 'http://localhost:11434/v1' }
      };

      await ai.embed('cat', { model: 'mock:embed' });

      expect(telemetry.span('embeddings embed').attributes).toMatchObject({
        'gen_ai.operation.name': 'embeddings',
        'gen_ai.provider.name': 'mock',
        'server.address': 'localhost',
        'server.port': 11434
      });
    });

    test('records nothing while the instrumentation is off', async () => {
      configOverrides.TELEMETRY_INSTRUMENTATIONS_AI = false;

      await ai.generate({ prompt: 'Hi' });
      await ai.embed('cat', { model: 'mock:embed' });

      expect(telemetry.spans()).toEqual([]);
    });
  });
});
