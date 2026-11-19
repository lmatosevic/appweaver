import { Value } from '@sinclair/typebox/value';
import { HealthCheckResult } from '@appweaver/common';
import {
  AiEmbedRequest,
  AiEmbedResponse,
  AiMessage,
  AiModelRequest,
  AiModelResponse,
  AiStreamPart,
  AiToolCall
} from '../types';
import { AiDriver } from './ai-driver';

/** Answers the requests of the mock models in a test, with a text or a part of the response. */
export type MockAiHandler = (
  request: AiModelRequest
) =>
  | string
  | Partial<AiModelResponse>
  | Promise<string | Partial<AiModelResponse>>;

const MOCK_HANDLER = Symbol.for('appweaver.MockAiHandler');
const handlers = globalThis as { [MOCK_HANDLER]?: MockAiHandler };

/**
 * Sets the answers of the `mock` endpoint, i.e. in a test asserting what the application does with a response, or
 * removes them with `undefined`, back to the built-in models.
 *
 * @example
 * mockAiResponse((request) => (request.tools ? { toolCalls: [...] } : 'Paris'));
 *
 * @param {MockAiHandler | undefined} handler - Answers the requests, or `undefined` to remove it.
 */
export function mockAiResponse(handler: MockAiHandler | undefined): void {
  handlers[MOCK_HANDLER] = handler;
}

/**
 * The built-in `mock` endpoint, calling no server, for the tests and the development without a model. Its `echo`
 * model (any model name) answers with the text of the last user message, its `tools` model calls every tool once
 * before it answers, and a request of a JSON schema is answered with the default value of the schema. Its embeddings
 * are vectors derived from the texts, the same for the same text.
 */
export class MockAiDriver extends AiDriver {
  public async generate(request: AiModelRequest): Promise<AiModelResponse> {
    const handler = handlers[MOCK_HANDLER];
    const answer = handler ? await handler(request) : this.answer(request);
    const response: Partial<AiModelResponse> =
      typeof answer === 'string' ? { text: answer } : answer;
    const text = response.text ?? '';
    const toolCalls = response.toolCalls ?? [];
    const inputTokens = countTokens(request.messages);
    const outputTokens = text.split(/\s+/).filter(Boolean).length;
    return {
      id: 'mock',
      model: request.model,
      finishReason: toolCalls.length ? 'tool-calls' : 'stop',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      },
      ...response,
      text,
      toolCalls
    };
  }

  public async *stream(request: AiModelRequest): AsyncIterable<AiStreamPart> {
    const response = await this.generate(request);
    if (response.reasoning) {
      yield { type: 'reasoning-delta', text: response.reasoning };
    }
    for (const chunk of response.text.match(/\S+\s*|\s+/g) ?? []) {
      yield { type: 'text-delta', text: chunk };
    }
    for (const toolCall of response.toolCalls) {
      yield { type: 'tool-call', toolCall };
    }
    yield {
      type: 'finish',
      finishReason: response.finishReason,
      usage: response.usage,
      id: response.id,
      model: response.model
    };
  }

  public async embed(request: AiEmbedRequest): Promise<AiEmbedResponse> {
    const dimensions = request.dimensions ?? 8;
    return {
      model: request.model,
      embeddings: request.input.map((text) => embedText(text, dimensions)),
      usage: { inputTokens: request.input.join(' ').split(/\s+/).length }
    };
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }

  /** @internal */
  private answer(request: AiModelRequest): Partial<AiModelResponse> {
    const format = request.responseFormat;
    if (format?.type === 'json-schema') {
      return { text: JSON.stringify(createValue(format.schema)) };
    }
    if (format?.type === 'json') {
      return { text: '{}' };
    }

    const last = request.messages[request.messages.length - 1];
    if (
      request.model === 'tools' &&
      request.tools?.length &&
      request.toolChoice !== 'none' &&
      last?.role !== 'tool'
    ) {
      return {
        toolCalls: request.tools.map(
          (tool, i): AiToolCall => ({
            id: `call_${i + 1}`,
            name: tool.name,
            arguments: createValue(tool.parameters)
          })
        )
      };
    }
    return { text: lastUserText(request.messages) };
  }
}

/** The text of the last user message, or of the results of the tools after it. */
function lastUserText(messages: AiMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'tool') {
      return message.content
        .map((part) =>
          typeof part.result === 'string'
            ? part.result
            : JSON.stringify(part.result)
        )
        .join('\n');
    }
    if (message.role === 'user') {
      return typeof message.content === 'string'
        ? message.content
        : message.content
            .map((part) => (part.type === 'text' ? part.text : ''))
            .join('');
    }
  }
  return '';
}

/** The default value of a schema, or an empty object for one TypeBox cannot create. */
function createValue(schema: object): unknown {
  try {
    return Value.Create(schema as never);
  } catch {
    return {};
  }
}

function countTokens(messages: AiMessage[]): number {
  return JSON.stringify(messages).split(/\s+/).length;
}

/** A unit vector derived from the characters of a text, the same for the same text. */
function embedText(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (let i = 0; i < text.length; i++) {
    vector[i % dimensions] += text.charCodeAt(i) * ((i % 7) + 1);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm ? vector.map((value) => value / norm) : vector;
}
