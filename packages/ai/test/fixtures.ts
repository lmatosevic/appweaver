import { configOverrides, HealthCheckResult } from '@appweaver/common';
import {
  AiCallOptions,
  AiDriver,
  AiModelRequest,
  AiModelResponse,
  AiStreamPart,
  registerAiDriver
} from '../index';

/** A response of the scripted driver, or the error it throws. */
export type ScriptedAnswer = Partial<AiModelResponse> | Error;

/**
 * A driver answering with the responses a test scripts, in turn, recording the requests. Its stream yields the text
 * word by word.
 */
export class ScriptedDriver extends AiDriver {
  static answers: ScriptedAnswer[] = [];
  static requests: { endpoint: string; request: AiModelRequest }[] = [];
  static streamFailure?: { after: number; error: Error };

  public async generate(
    request: AiModelRequest,
    options?: AiCallOptions
  ): Promise<AiModelResponse> {
    options?.signal?.throwIfAborted();
    ScriptedDriver.requests.push({ endpoint: this.endpoint.name, request });
    const answer = ScriptedDriver.answers.shift() ?? { text: 'done' };
    if (answer instanceof Error) {
      throw answer;
    }
    return {
      text: '',
      toolCalls: [],
      finishReason: answer.toolCalls?.length ? 'tool-calls' : 'stop',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      ...answer
    };
  }

  public async *stream(
    request: AiModelRequest,
    options?: AiCallOptions
  ): AsyncIterable<AiStreamPart> {
    const response = await this.generate(request, options);
    let sent = 0;
    for (const word of response.text.match(/\S+\s*/g) ?? []) {
      const failure = ScriptedDriver.streamFailure;
      if (failure && sent === failure.after) {
        throw failure.error;
      }
      options?.signal?.throwIfAborted();
      yield { type: 'text-delta', text: word };
      sent++;
    }
    if (response.reasoning) {
      yield { type: 'reasoning-delta', text: response.reasoning };
    }
    for (const toolCall of response.toolCalls) {
      yield { type: 'tool-call', toolCall };
    }
    yield {
      type: 'finish',
      finishReason: response.finishReason,
      usage: response.usage,
      id: 'scripted',
      model: request.model
    };
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }
}

/** Configures the `main` and `backup` endpoints of the scripted driver, and the given `ai` keys. */
export function useScriptedEndpoints(
  overrides: Record<string, unknown> = {}
): void {
  ScriptedDriver.answers = [];
  ScriptedDriver.requests = [];
  ScriptedDriver.streamFailure = undefined;
  registerAiDriver('scripted', ScriptedDriver);
  Object.assign(configOverrides, {
    AI_ENDPOINTS: {
      main: { driver: 'scripted' },
      backup: { driver: 'scripted' },
      limited: { driver: 'scripted', capabilities: [] }
    },
    AI_DEFAULT_MODEL: 'main:model-a',
    AI_ALIASES: { failover: ['main:model-a', 'backup:model-b'] },
    ...overrides
  });
}

/** Removes the `ai` overrides of {@link useScriptedEndpoints}. */
export function clearAiOverrides(): void {
  for (const key of Object.keys(configOverrides)) {
    if (key.startsWith('AI_')) {
      delete configOverrides[key];
    }
  }
  registerAiDriver('scripted', undefined);
}
