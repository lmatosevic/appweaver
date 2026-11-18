import { APIConnectionTimeoutError } from 'openai';
import { Type } from '@sinclair/typebox';
import { AiEndpoint, AiStreamPart } from '@appweaver/ai';
import { configOverrides, createLogger, ErrorCode } from '@appweaver/common';
import { testAiDriverContract } from '@appweaver/testing';
import { OpenAiDriver } from '../openai-driver';
import { FakeServer } from './fake-server';

const logger = createLogger('ai');

let server: FakeServer;

/** An endpoint of the fake server. */
function endpoint(overrides: Partial<AiEndpoint> = {}): AiEndpoint {
  return {
    name: 'local',
    driver: 'openai',
    preset: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    capabilities: ['tools', 'json', 'json-schema', 'embeddings'],
    headers: { 'X-Title': 'Test' },
    timeout: 5000,
    maxRetries: 0,
    options: {},
    ...overrides
  };
}

/** Creates the driver on the fake server, the SDK reading the global fetch when it is created. */
function createDriver(overrides: Partial<AiEndpoint> = {}): OpenAiDriver {
  server = new FakeServer();
  jest.spyOn(globalThis, 'fetch').mockImplementation(server.fetch as any);
  return new OpenAiDriver(endpoint(overrides));
}

async function collect(
  stream: AsyncIterable<AiStreamPart>
): Promise<AiStreamPart[]> {
  const parts: AiStreamPart[] = [];
  for await (const part of stream) {
    parts.push(part);
  }
  return parts;
}

afterEach(() => {
  jest.restoreAllMocks();
});

testAiDriverContract('OpenAiDriver', () => createDriver());

describe('openai-driver', () => {
  describe('generate', () => {
    test('sends the messages and the parameters of the Chat Completions API', async () => {
      const driver = createDriver();

      const response = await driver.generate({
        model: 'qwen3:8b',
        messages: [
          { role: 'system', content: 'Be brief' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              {
                type: 'image',
                url: 'https://example.com/cat.png',
                detail: 'low'
              },
              { type: 'image', data: 'AAA', mimeType: 'image/png' },
              {
                type: 'file',
                data: 'JVBE',
                mimeType: 'application/pdf',
                name: 'a.pdf'
              },
              {
                type: 'file',
                url: 'https://example.com/b.pdf',
                mimeType: 'application/pdf'
              }
            ]
          },
          {
            role: 'assistant',
            content: [
              { type: 'reasoning', text: 'Hidden' },
              { type: 'text', text: 'Let me check' },
              {
                type: 'tool-call',
                id: 'c1',
                name: 'lookup',
                arguments: { word: 'cat' }
              },
              {
                type: 'tool-call',
                id: 'c2',
                name: 'raw',
                arguments: '{"x":1}'
              },
              {
                type: 'tool-call',
                id: 'c3',
                name: 'none',
                arguments: undefined
              }
            ]
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                id: 'c1',
                name: 'lookup',
                result: { found: true }
              },
              { type: 'tool-result', id: 'c2', name: 'raw', result: 'text' }
            ]
          },
          { role: 'assistant', content: 'Plain' },
          { role: 'user', content: 'Thanks' }
        ],
        maxTokens: 50,
        temperature: 0.5,
        topP: 0.9,
        stop: ['END'],
        seed: 7,
        providerOptions: { keep_alive: '5m' }
      });

      expect(response).toEqual({
        text: 'Hello!',
        toolCalls: [],
        finishReason: 'stop',
        id: 'chatcmpl-1',
        model: 'qwen3:8b-0001',
        reasoning: 'Thinking',
        usage: {
          inputTokens: 12,
          outputTokens: 3,
          totalTokens: 15,
          cachedInputTokens: 4,
          reasoningTokens: 2
        }
      });
      const { body } = server.last();
      expect(body).toMatchObject({
        model: 'qwen3:8b',
        max_tokens: 50,
        temperature: 0.5,
        top_p: 0.9,
        stop: ['END'],
        seed: 7,
        keep_alive: '5m'
      });
      expect(body.messages).toEqual([
        { role: 'system', content: 'Be brief' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/cat.png', detail: 'low' }
            },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AAA' }
            },
            {
              type: 'file',
              file: {
                file_data: 'data:application/pdf;base64,JVBE',
                filename: 'a.pdf'
              }
            },
            { type: 'file', file: { file_data: 'https://example.com/b.pdf' } }
          ]
        },
        {
          role: 'assistant',
          content: 'Let me check',
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'lookup', arguments: '{"word":"cat"}' }
            },
            {
              id: 'c2',
              type: 'function',
              function: { name: 'raw', arguments: '{"x":1}' }
            },
            {
              id: 'c3',
              type: 'function',
              function: { name: 'none', arguments: '{}' }
            }
          ]
        },
        { role: 'tool', tool_call_id: 'c1', content: '{"found":true}' },
        { role: 'tool', tool_call_id: 'c2', content: 'text' },
        { role: 'assistant', content: 'Plain' },
        { role: 'user', content: 'Thanks' }
      ]);
    });

    test('sends the tools, the tool choice and the JSON schema', async () => {
      const driver = createDriver();
      const parameters = Type.Object({ word: Type.String() });

      await driver.generate({
        model: 'm',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [{ name: 'lookup', description: 'Looks up', parameters }],
        toolChoice: { name: 'lookup' }
      });
      await driver.generate({
        model: 'm',
        messages: [{ role: 'user', content: 'Hi' }],
        responseFormat: { type: 'json-schema', schema: parameters }
      });
      await driver.generate({
        model: 'm',
        messages: [{ role: 'user', content: 'Hi' }],
        responseFormat: { type: 'json' }
      });

      const [tools, schema, json] = server.requests.map(
        (request) => request.body
      );
      expect(tools.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'lookup',
            description: 'Looks up',
            parameters: {
              type: 'object',
              properties: { word: { type: 'string' } },
              required: ['word']
            }
          }
        }
      ]);
      expect(tools.tool_choice).toEqual({
        type: 'function',
        function: { name: 'lookup' }
      });
      expect(schema.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: {
            type: 'object',
            properties: { word: { type: 'string' } },
            required: ['word']
          }
        }
      });
      expect(json.response_format).toEqual({ type: 'json_object' });
    });

    test('sends the parameters of the preset', async () => {
      const openai = createDriver({
        options: { maxTokensParam: 'max_completion_tokens' }
      });
      await openai.generate({
        model: 'm',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 10,
        reasoning: { effort: 'low' },
        toolChoice: 'auto'
      });
      const sent = server.last().body;

      const router = createDriver({ options: { reasoningParam: 'reasoning' } });
      await router.generate({
        model: 'm',
        messages: [{ role: 'user', content: 'Hi' }],
        reasoning: { effort: 'high' }
      });

      expect(sent).toMatchObject({
        max_completion_tokens: 10,
        reasoning_effort: 'low',
        tool_choice: 'auto'
      });
      expect(server.last().body).toMatchObject({
        reasoning: { effort: 'high' }
      });
    });

    test('parses the tool calls, keeping arguments that are not JSON', async () => {
      const driver = createDriver();
      jest.spyOn(logger, 'warn').mockImplementation();
      server.answers.push({
        status: 200,
        body: {
          id: 'x',
          object: 'chat.completion',
          created: 1,
          model: 'm',
          choices: [
            {
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'a',
                    type: 'function',
                    function: { name: 'bad', arguments: '{oops' }
                  },
                  {
                    id: 'b',
                    type: 'function',
                    function: { name: 'empty', arguments: '' }
                  }
                ]
              }
            }
          ]
        }
      });

      const response = await driver.generate({ model: 'm', messages: [] });

      expect(response.toolCalls).toEqual([
        { id: 'a', name: 'bad', arguments: '{oops' },
        { id: 'b', name: 'empty', arguments: {} }
      ]);
      expect(response.finishReason).toBe('tool-calls');
      expect(response.usage).toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    test.each([
      ['length', 'length'],
      ['content_filter', 'content-filter'],
      ['function_call', 'tool-calls'],
      ['other', 'other']
    ])('maps the finish reason %s', async (reason, expected) => {
      const driver = createDriver();
      server.answers.push({
        status: 200,
        body: {
          id: 'x',
          object: 'chat.completion',
          created: 1,
          model: 'm',
          choices: [
            {
              index: 0,
              finish_reason: reason,
              message: { role: 'assistant', content: 'x' }
            }
          ]
        }
      });

      await expect(
        driver.generate({ model: 'm', messages: [] })
      ).resolves.toMatchObject({
        finishReason: expected
      });
    });

    test('answers a refusal as filtered content', async () => {
      const driver = createDriver();
      server.answers.push({
        status: 200,
        body: {
          id: 'x',
          object: 'chat.completion',
          created: 1,
          model: 'm',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: null, refusal: 'No' }
            }
          ]
        }
      });

      await expect(
        driver.generate({ model: 'm', messages: [] })
      ).resolves.toMatchObject({
        text: 'No',
        finishReason: 'content-filter'
      });
    });

    test('answers an empty response with no text', async () => {
      const driver = createDriver();
      server.answers.push({
        status: 200,
        body: {
          id: 'x',
          object: 'chat.completion',
          created: 1,
          model: 'm',
          choices: []
        }
      });

      await expect(
        driver.generate({ model: 'm', messages: [] })
      ).resolves.toMatchObject({
        text: '',
        toolCalls: [],
        finishReason: 'stop'
      });
    });
  });

  describe('errors', () => {
    test.each([
      [
        429,
        { 'retry-after': '3' },
        {},
        ErrorCode.AiRateLimited,
        { retryAfter: 3, status: 429 }
      ],
      [429, {}, {}, ErrorCode.AiRateLimited, { status: 429 }],
      [
        401,
        {},
        { error: { code: 'invalid_api_key', message: 'Bad key' } },
        ErrorCode.AiAuthFailed,
        { providerCode: 'invalid_api_key' }
      ],
      [403, {}, {}, ErrorCode.AiAuthFailed, {}],
      [408, {}, {}, ErrorCode.AiTimeout, {}],
      [503, {}, {}, ErrorCode.AiProviderUnavailable, {}],
      [
        400,
        {},
        { error: { code: 'context_length_exceeded', message: 'Too long' } },
        ErrorCode.AiContextLengthExceeded,
        {}
      ],
      [
        400,
        {},
        { error: { message: 'This model maximum context length is 8192' } },
        ErrorCode.AiContextLengthExceeded,
        {}
      ],
      [
        404,
        {},
        { error: { message: 'model not found' } },
        ErrorCode.AiRequestFailed,
        { status: 404 }
      ]
    ])('maps the status %s', async (status, headers, body, code, details) => {
      const driver = createDriver();
      server.answers.push({ status, headers, body });

      await expect(
        driver.generate({ model: 'm', messages: [] })
      ).rejects.toMatchObject({
        code,
        details: { model: 'local:m', endpoint: 'local', ...details }
      });
    });

    test('maps a connection error and a timeout', async () => {
      const driver = createDriver();
      server.fetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(
        driver.generate({ model: 'm', messages: [] })
      ).rejects.toMatchObject({
        code: ErrorCode.AiProviderUnavailable
      });

      jest
        .spyOn((driver as any)._client.chat.completions, 'create')
        .mockRejectedValueOnce(new APIConnectionTimeoutError());
      await expect(
        driver.generate({ model: 'm', messages: [] }, { timeout: 10 })
      ).rejects.toMatchObject({ code: ErrorCode.AiTimeout });
    });

    test('throws the reason of an aborted call', async () => {
      const driver = createDriver();
      const reason = new Error('Cancelled');

      await expect(
        driver.generate(
          { model: 'm', messages: [] },
          { signal: AbortSignal.abort(reason) }
        )
      ).rejects.toBe(reason);
      await expect(
        collect(
          driver.stream(
            { model: 'm', messages: [] },
            { signal: AbortSignal.abort(reason) }
          )
        )
      ).rejects.toBe(reason);
      await expect(
        driver.embed(
          { model: 'm', input: ['a'] },
          { signal: AbortSignal.abort(reason) }
        )
      ).rejects.toBe(reason);
    });

    test('throws the reason of a stream aborted while it is read', async () => {
      const driver = createDriver();
      const controller = new AbortController();
      const reason = new Error('Client gone');

      const read = async () => {
        for await (const _ of driver.stream(
          { model: 'm', messages: [] },
          { signal: controller.signal }
        )) {
          controller.abort(reason);
        }
      };

      await expect(read()).rejects.toBe(reason);
    });

    test('wraps any other error', async () => {
      const driver = createDriver();
      jest
        .spyOn((driver as any)._client.chat.completions, 'create')
        .mockRejectedValueOnce(new Error('Unexpected'));

      await expect(
        driver.generate({ model: 'm', messages: [] })
      ).rejects.toMatchObject({
        code: ErrorCode.AiRequestFailed,
        message: "The AI endpoint 'local' failed: Unexpected"
      });
    });
  });

  describe('stream', () => {
    test('streams the deltas, the reasoning and the usage', async () => {
      const driver = createDriver();

      const parts = await collect(
        driver.stream({
          model: 'm',
          messages: [{ role: 'user', content: 'Hi' }]
        })
      );

      expect(parts).toEqual([
        { type: 'reasoning-delta', text: 'Hmm' },
        { type: 'text-delta', text: 'Hel' },
        { type: 'text-delta', text: 'lo!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
          id: 'chatcmpl-2',
          model: 'm'
        }
      ]);
      expect(server.last().body.stream_options).toEqual({
        include_usage: true
      });
    });

    test('streams a refusal, and tool calls without IDs, without usage', async () => {
      const driver = createDriver({ options: { streamUsage: false } });
      server.chunks = [
        { delta: { refusal: 'Not allowed' } },
        {
          delta: { tool_calls: [{ index: 1, function: { arguments: '{}' } }] }
        },
        { delta: {}, finish_reason: 'stop' }
      ];

      const parts = await collect(driver.stream({ model: 'm', messages: [] }));

      expect(parts).toEqual([
        { type: 'text-delta', text: 'Not allowed' },
        {
          type: 'tool-call',
          toolCall: { id: 'call_1', name: '', arguments: {} }
        },
        {
          type: 'finish',
          finishReason: 'content-filter',
          id: 'chatcmpl-2',
          model: 'm'
        }
      ]);
      expect(server.last().body.stream_options).toBeUndefined();
    });
  });

  describe('embed', () => {
    test('embeds the texts in their order', async () => {
      const driver = createDriver();

      const response = await driver.embed({
        model: 'nomic-embed-text',
        input: ['a', 'b'],
        dimensions: 3
      });

      expect(response).toEqual({
        model: 'nomic-embed-text',
        embeddings: [
          [0, 0.5, 1],
          [1, 0.5, 1]
        ],
        usage: { inputTokens: 4 }
      });
      expect(server.last('/embeddings').body).toEqual({
        model: 'nomic-embed-text',
        input: ['a', 'b'],
        encoding_format: 'float',
        dimensions: 3
      });
    });

    test('maps the errors of the embeddings', async () => {
      const driver = createDriver();
      server.answers.push({
        status: 500,
        body: { error: { message: 'Boom' } }
      });

      await expect(
        driver.embed({ model: 'm', input: ['a'] })
      ).rejects.toMatchObject({
        code: ErrorCode.AiProviderUnavailable
      });
    });

    test('embeds without the usage of the server', async () => {
      const driver = createDriver();
      server.answers.push({
        status: 200,
        body: {
          object: 'list',
          model: 'm',
          data: [{ index: 0, embedding: [1] }]
        }
      });

      await expect(driver.embed({ model: 'm', input: ['a'] })).resolves.toEqual(
        {
          model: 'm',
          embeddings: [[1]],
          usage: undefined
        }
      );
    });
  });

  describe('checkHealth', () => {
    test('lists the models of the endpoint', async () => {
      const driver = createDriver();

      await expect(driver.checkHealth()).resolves.toEqual({ success: true });
      expect(server.last('/models').method).toBe('GET');

      server.answers.push({
        status: 500,
        body: { error: { message: 'Down' } }
      });
      await expect(driver.checkHealth()).resolves.toMatchObject({
        success: false
      });
    });
  });

  describe('client', () => {
    test('sends the key, the headers, and a placeholder key to a local server', async () => {
      const driver = createDriver({ apiKey: 'sk-1' });
      await driver.generate({ model: 'm', messages: [] });
      const [, init] = server.fetch.mock.calls.at(-1)!;
      const headers = new Headers(init!.headers);

      expect(headers.get('authorization')).toBe('Bearer sk-1');
      expect(headers.get('x-title')).toBe('Test');

      const local = createDriver();
      await local.generate({ model: 'm', messages: [] });
      expect(
        new Headers(server.fetch.mock.calls.at(-1)![1]!.headers).get(
          'authorization'
        )
      ).toBe('Bearer none');
      expect(configOverrides).toBeDefined();
    });
  });
});
