import { Type } from '@sinclair/typebox';
import { testAiDriverContract } from '@appweaver/testing';
import {
  AiStreamPart,
  MockAiDriver,
  mockAiResponse,
  ModelRegistry
} from '../../index';

const endpoint = () => new ModelRegistry().endpoint('mock');

testAiDriverContract('MockAiDriver', () => new MockAiDriver(endpoint()), {
  model: 'tools'
});

describe('mock-driver', () => {
  const driver = new MockAiDriver(endpoint());

  afterEach(() => {
    mockAiResponse(undefined);
  });

  test('echoes the text of the last user message', async () => {
    const response = await driver.generate({
      model: 'echo',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hi ' },
            { type: 'image', url: 'x' },
            { type: 'text', text: 'there' }
          ]
        }
      ]
    });

    expect(response).toMatchObject({
      text: 'Hi there',
      finishReason: 'stop',
      model: 'echo'
    });
  });

  test('echoes the results of the tools, and nothing without messages', async () => {
    const response = await driver.generate({
      model: 'echo',
      messages: [
        {
          role: 'tool',
          content: [
            { type: 'tool-result', id: '1', name: 'a', result: 'text' },
            { type: 'tool-result', id: '2', name: 'b', result: { n: 1 } }
          ]
        }
      ]
    });

    expect(response.text).toBe('text\n{"n":1}');
    expect((await driver.generate({ model: 'echo', messages: [] })).text).toBe(
      ''
    );
  });

  test('answers the JSON mode with an object', async () => {
    const response = await driver.generate({
      model: 'echo',
      messages: [],
      responseFormat: { type: 'json' }
    });

    expect(response.text).toBe('{}');
  });

  test('answers a schema TypeBox cannot create with an empty object', async () => {
    const response = await driver.generate({
      model: 'echo',
      messages: [],
      responseFormat: {
        type: 'json-schema',
        schema: Type.Unsafe({ $ref: 'missing' })
      }
    });

    expect(response.text).toBe('{}');
  });

  test('streams the scripted answers', async () => {
    mockAiResponse(async () => ({ text: 'A b', reasoning: 'Think' }));

    const parts: AiStreamPart[] = [];
    for await (const part of driver.stream({ model: 'echo', messages: [] })) {
      parts.push(part);
    }

    expect(parts.map((part) => part.type)).toEqual([
      'reasoning-delta',
      'text-delta',
      'text-delta',
      'finish'
    ]);
  });

  test('embeds the same text into the same unit vector', async () => {
    const { embeddings } = await driver.embed({
      model: 'embed',
      input: ['cat', 'cat', '']
    });

    expect(embeddings[0]).toHaveLength(8);
    expect(embeddings[0]).toEqual(embeddings[1]);
    expect(Math.hypot(...embeddings[0])).toBeCloseTo(1);
    expect(embeddings[2].every((value) => value === 0)).toBe(true);
  });
});
