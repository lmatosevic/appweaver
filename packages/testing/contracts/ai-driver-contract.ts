import type { AiDriver, AiStreamPart } from '@appweaver/ai';
import { Type } from '@sinclair/typebox';
import { ContractFactory, runner } from './contract-util';

/** The options of {@link testAiDriverContract}. */
export type AiDriverContractOptions = {
  /** The model name the requests call. Default: `test` */
  model?: string;
  /** Whether the endpoint embeds, its `embed` then tested. Default: `true` */
  embeddings?: boolean;
};

/**
 * Tests an `AiDriver` against the behavior every driver shares, with the `describe` and `test` globals of Jest, Vitest
 * or Bun. The driver must call a mocked server or a local model, since the test sends real requests: a request with
 * tools must be answered with a call of the `lookup` tool, any other one with a text, a JSON one with a JSON object.
 *
 * @param {string} name - The name of the driver, i.e. `OpenAiDriver`.
 * @param {ContractFactory<AiDriver>} create - Creates the driver.
 * @param {AiDriverContractOptions} [options] - The model and the capabilities tested.
 */
export function testAiDriverContract(
  name: string,
  create: ContractFactory<AiDriver>,
  options: AiDriverContractOptions = {}
): void {
  const { describe, test, expect, beforeEach } = runner();
  const model = options.model ?? 'test';
  const lookup = {
    name: 'lookup',
    description: 'Looks a word up',
    parameters: Type.Object({ word: Type.String() })
  };

  describe(`${name} implements the AiDriver contract`, () => {
    let driver: AiDriver;

    beforeEach(async () => {
      driver = await create();
    });

    test('answers with a text and the reason it stopped', async () => {
      const response = await driver.generate({
        model,
        messages: [
          { role: 'system', content: 'Answer briefly.' },
          { role: 'user', content: 'Say hello' }
        ],
        maxTokens: 64,
        temperature: 0
      });

      expect(typeof response.text).toBe('string');
      expect(response.text.length > 0).toBe(true);
      expect(response.toolCalls).toEqual([]);
      expect(['stop', 'length'].includes(response.finishReason)).toBe(true);
    });

    test('calls a tool with parsed arguments', async () => {
      const response = await driver.generate({
        model,
        messages: [{ role: 'user', content: 'Look up the word "cat"' }],
        tools: [lookup],
        toolChoice: 'required'
      });

      expect(response.toolCalls.length > 0).toBe(true);
      expect(response.toolCalls[0].name).toBe('lookup');
      expect(typeof response.toolCalls[0].id).toBe('string');
      expect(typeof response.toolCalls[0].arguments).toBe('object');
    });

    test('continues a conversation with the results of the tools', async () => {
      const response = await driver.generate({
        model,
        messages: [
          { role: 'user', content: 'Look up the word "cat"' },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                id: 'call_1',
                name: 'lookup',
                arguments: { word: 'cat' }
              }
            ]
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                id: 'call_1',
                name: 'lookup',
                result: { meaning: 'A small domesticated feline' }
              }
            ]
          }
        ]
      });

      expect(typeof response.text).toBe('string');
    });

    test('answers with JSON in the JSON mode', async () => {
      const response = await driver.generate({
        model,
        messages: [{ role: 'user', content: 'Give a JSON object' }],
        responseFormat: {
          type: 'json-schema',
          schema: Type.Object({ answer: Type.String() })
        }
      });

      expect(typeof JSON.parse(response.text)).toBe('object');
    });

    test('streams the text deltas and ends with a finish part', async () => {
      const parts: AiStreamPart[] = [];
      for await (const part of driver.stream({
        model,
        messages: [{ role: 'user', content: 'Say hello' }]
      })) {
        parts.push(part);
      }

      const text = parts
        .map((part) => (part.type === 'text-delta' ? part.text : ''))
        .join('');
      expect(text.length > 0).toBe(true);
      expect(parts[parts.length - 1].type).toBe('finish');
    });

    test('streams a tool call whole', async () => {
      const parts: AiStreamPart[] = [];
      for await (const part of driver.stream({
        model,
        messages: [{ role: 'user', content: 'Look up the word "cat"' }],
        tools: [lookup],
        toolChoice: 'required'
      })) {
        parts.push(part);
      }

      const call = parts.find((part) => part.type === 'tool-call');
      expect(call).toBeDefined();
      expect(call?.type === 'tool-call' ? call.toolCall.name : undefined).toBe(
        'lookup'
      );
      expect(parts[parts.length - 1]).toMatchObject({
        type: 'finish',
        finishReason: 'tool-calls'
      });
    });

    if (options.embeddings !== false) {
      test('embeds every text into a vector', async () => {
        const response = await driver.embed({
          model,
          input: ['cat', 'dog']
        });

        expect(response.embeddings.length).toBe(2);
        expect(response.embeddings[0].length > 0).toBe(true);
        expect(typeof response.embeddings[0][0]).toBe('number');
      });
    }

    test('tells its capabilities', () => {
      expect(typeof driver.supports('tools', model)).toBe('boolean');
    });

    test('reports its health', async () => {
      const result = await driver.checkHealth();

      expect(typeof result.success).toBe('boolean');
    });
  });
}
