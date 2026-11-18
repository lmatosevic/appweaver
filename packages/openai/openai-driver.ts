import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError
} from 'openai';
import {
  AiCallOptions,
  AiDriver,
  AiEmbedRequest,
  AiEmbedResponse,
  AiEndpoint,
  AiFinishReason,
  AiMessage,
  AiModelRequest,
  AiModelResponse,
  AiStreamPart,
  AiToolCall,
  AiUsage
} from '@appweaver/ai';
import {
  AiError,
  createLogger,
  ErrorCode,
  HealthCheckResult
} from '@appweaver/common';

const logger = createLogger('ai');

type ChatParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;
type ChatUsage = OpenAI.Completions.CompletionUsage;

/** The fields of a delta and a message the OpenAI-compatible servers add for the reasoning. */
type ReasoningFields = { reasoning_content?: string; reasoning?: string };

/**
 * The `openai` driver: the Chat Completions and the Embeddings APIs of OpenAI, spoken by every OpenAI-compatible
 * server (Ollama, LM Studio, vLLM, llama.cpp, OpenRouter, Groq, ...), with the official `openai` SDK. The options of
 * the preset of an endpoint set the parameter of the maximum tokens (`maxTokensParam`), the one of the reasoning
 * (`reasoningParam`) and whether the usage is streamed (`streamUsage`).
 */
export class OpenAiDriver extends AiDriver {
  /** @internal */
  private readonly _client: OpenAI;

  constructor(endpoint: AiEndpoint) {
    super(endpoint);
    this._client = new OpenAI({
      // The local servers take any key, the SDK refuses none
      apiKey: endpoint.apiKey ?? 'none',
      baseURL: endpoint.baseUrl,
      timeout: endpoint.timeout,
      maxRetries: endpoint.maxRetries,
      defaultHeaders: endpoint.headers
    });
  }

  public async generate(
    request: AiModelRequest,
    options: AiCallOptions = {}
  ): Promise<AiModelResponse> {
    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await this._client.chat.completions.create(
        this.params(request),
        requestOptions(options)
      );
    } catch (error) {
      throw this.toError(error, request.model, options.signal);
    }

    const choice = completion.choices[0];
    const message = choice?.message;
    const reasoning = message as ReasoningFields | undefined;
    return {
      text: message?.content ?? message?.refusal ?? '',
      toolCalls: (message?.tool_calls ?? [])
        .filter((call) => call.type === 'function')
        .map((call) =>
          toolCall(call.id, call.function.name, call.function.arguments)
        ),
      finishReason: message?.refusal
        ? 'content-filter'
        : finishReason(choice?.finish_reason),
      id: completion.id,
      model: completion.model,
      reasoning: reasoning?.reasoning_content ?? reasoning?.reasoning,
      usage: usage(completion.usage)
    };
  }

  public async *stream(
    request: AiModelRequest,
    options: AiCallOptions = {}
  ): AsyncIterable<AiStreamPart> {
    const streamUsage = this.endpoint.options.streamUsage !== false;
    const toolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finish: AiFinishReason = 'stop';
    let chunkUsage: AiUsage | undefined;
    let id: string | undefined;
    let model: string | undefined;

    try {
      const stream = await this._client.chat.completions.create(
        {
          ...this.params(request),
          stream: true,
          ...(streamUsage ? { stream_options: { include_usage: true } } : {})
        },
        requestOptions(options)
      );
      for await (const chunk of stream) {
        id ??= chunk.id;
        model ??= chunk.model;
        chunkUsage = usage(chunk.usage) ?? chunkUsage;
        const choice = chunk.choices[0];
        if (!choice) {
          continue;
        }
        const delta = choice.delta as typeof choice.delta & ReasoningFields;
        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (reasoning) {
          yield { type: 'reasoning-delta', text: reasoning };
        }
        if (delta.content) {
          yield { type: 'text-delta', text: delta.content };
        }
        if (delta.refusal) {
          finish = 'content-filter';
          yield { type: 'text-delta', text: delta.refusal };
        }
        for (const call of delta.tool_calls ?? []) {
          const current = toolCalls.get(call.index) ?? {
            id: '',
            name: '',
            arguments: ''
          };
          current.id ||= call.id ?? '';
          current.name += call.function?.name ?? '';
          current.arguments += call.function?.arguments ?? '';
          toolCalls.set(call.index, current);
        }
        if (choice.finish_reason) {
          finish =
            finish === 'content-filter'
              ? finish
              : finishReason(choice.finish_reason);
        }
      }
      // The SDK ends an aborted stream without an error
      options.signal?.throwIfAborted();
    } catch (error) {
      throw this.toError(error, request.model, options.signal);
    }

    const calls = [...toolCalls.entries()].sort(([a], [b]) => a - b);
    for (const [index, call] of calls) {
      yield {
        type: 'tool-call',
        toolCall: toolCall(
          call.id || `call_${index}`,
          call.name,
          call.arguments
        )
      };
    }
    yield {
      type: 'finish',
      finishReason: calls.length && finish === 'stop' ? 'tool-calls' : finish,
      usage: chunkUsage,
      id,
      model
    };
  }

  public async embed(
    request: AiEmbedRequest,
    options: AiCallOptions = {}
  ): Promise<AiEmbedResponse> {
    try {
      const response = await this._client.embeddings.create(
        {
          model: request.model,
          input: request.input,
          encoding_format: 'float',
          ...(request.dimensions ? { dimensions: request.dimensions } : {}),
          ...request.providerOptions
        },
        requestOptions(options)
      );
      return {
        model: response.model,
        embeddings: [...response.data]
          .sort((a, b) => a.index - b.index)
          .map((entry) => entry.embedding),
        usage: response.usage
          ? { inputTokens: response.usage.prompt_tokens }
          : undefined
      };
    } catch (error) {
      throw this.toError(error, request.model, options.signal);
    }
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    try {
      await this._client.models.list({ timeout: 5000, maxRetries: 0 });
      return { success: true };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  /** @internal */
  private params(request: AiModelRequest): ChatParams {
    const { options } = this.endpoint;
    const params: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.flatMap(toMessages),
      temperature: request.temperature,
      top_p: request.topP,
      stop: request.stop,
      seed: request.seed
    };
    if (request.maxTokens !== undefined) {
      params[(options.maxTokensParam as string) ?? 'max_tokens'] =
        request.maxTokens;
    }
    if (request.tools?.length) {
      params.tools = request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: jsonSchema(tool.parameters)
        }
      }));
    }
    if (request.toolChoice) {
      params.tool_choice =
        typeof request.toolChoice === 'string'
          ? request.toolChoice
          : { type: 'function', function: { name: request.toolChoice.name } };
    }
    const format = request.responseFormat;
    if (format?.type === 'json') {
      params.response_format = { type: 'json_object' };
    } else if (format?.type === 'json-schema') {
      params.response_format = {
        type: 'json_schema',
        json_schema: {
          name: format.name ?? 'response',
          schema: jsonSchema(format.schema)
        }
      };
    }
    if (request.reasoning) {
      if (options.reasoningParam === 'reasoning') {
        params.reasoning = { effort: request.reasoning.effort };
      } else {
        params.reasoning_effort = request.reasoning.effort;
      }
    }
    Object.assign(params, request.providerOptions);
    return Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined)
    ) as unknown as ChatParams;
  }

  /** @internal */
  private toError(
    error: unknown,
    model: string,
    signal?: AbortSignal
  ): unknown {
    if (signal?.aborted) {
      return signal.reason;
    }
    if (error instanceof APIUserAbortError) {
      return error;
    }
    const details = {
      model: `${this.endpoint.name}:${model}`,
      endpoint: this.endpoint.name
    };
    const message = `The AI endpoint '${this.endpoint.name}' failed: ${(error as Error).message}`;
    if (error instanceof APIConnectionTimeoutError) {
      return new AiError(ErrorCode.AiTimeout, message, details, {
        cause: error
      });
    }
    if (error instanceof APIConnectionError) {
      return new AiError(ErrorCode.AiProviderUnavailable, message, details, {
        cause: error
      });
    }
    if (!(error instanceof APIError)) {
      return new AiError(ErrorCode.AiRequestFailed, message, details, {
        cause: error
      });
    }

    const status = error.status ?? 0;
    const provider = {
      ...details,
      status: error.status,
      ...(error.code ? { providerCode: String(error.code) } : {})
    };
    if (status === 429) {
      const retryAfter = Number(error.headers?.get('retry-after'));
      return new AiError(
        ErrorCode.AiRateLimited,
        message,
        Number.isFinite(retryAfter) && retryAfter > 0
          ? { ...provider, retryAfter }
          : provider,
        { cause: error }
      );
    }
    if (status === 401 || status === 403) {
      return new AiError(ErrorCode.AiAuthFailed, message, provider, {
        cause: error
      });
    }
    if (status === 408) {
      return new AiError(ErrorCode.AiTimeout, message, provider, {
        cause: error
      });
    }
    if (status >= 500) {
      return new AiError(ErrorCode.AiProviderUnavailable, message, provider, {
        cause: error
      });
    }
    if (
      error.code === 'context_length_exceeded' ||
      /context length|context window|maximum context|too many tokens/i.test(
        error.message
      )
    ) {
      return new AiError(ErrorCode.AiContextLengthExceeded, message, provider, {
        cause: error
      });
    }
    return new AiError(ErrorCode.AiRequestFailed, message, provider, {
      cause: error
    });
  }
}

/** The messages of the Chat Completions API of a message, one per tool result. */
function toMessages(message: AiMessage): ChatMessage[] {
  switch (message.role) {
    case 'system':
      return [{ role: 'system', content: message.content }];
    case 'user':
      return [
        {
          role: 'user',
          content:
            typeof message.content === 'string'
              ? message.content
              : message.content.map(
                  (part): OpenAI.Chat.ChatCompletionContentPart => {
                    if (part.type === 'text') {
                      return { type: 'text', text: part.text };
                    }
                    if (part.type === 'image') {
                      return {
                        type: 'image_url',
                        image_url: {
                          url: part.url ?? dataUrl(part.mimeType, part.data),
                          ...(part.detail ? { detail: part.detail } : {})
                        }
                      };
                    }
                    return {
                      type: 'file',
                      file: {
                        file_data:
                          part.data !== undefined
                            ? dataUrl(part.mimeType, part.data)
                            : part.url,
                        ...(part.name ? { filename: part.name } : {})
                      }
                    };
                  }
                )
        }
      ];
    case 'assistant': {
      if (typeof message.content === 'string') {
        return [{ role: 'assistant', content: message.content }];
      }
      const text = message.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('');
      const toolCalls = message.content.flatMap((part) =>
        part.type === 'tool-call'
          ? [
              {
                id: part.id,
                type: 'function' as const,
                function: {
                  name: part.name,
                  arguments:
                    typeof part.arguments === 'string'
                      ? part.arguments
                      : JSON.stringify(part.arguments ?? {})
                }
              }
            ]
          : []
      );
      return [
        {
          role: 'assistant',
          content: text || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {})
        }
      ];
    }
    case 'tool':
      return message.content.map((part) => ({
        role: 'tool',
        tool_call_id: part.id,
        content:
          typeof part.result === 'string'
            ? part.result
            : JSON.stringify(part.result)
      }));
  }
}

/** A tool call, its arguments parsed from their JSON, kept as the raw text when they are not valid JSON. */
function toolCall(id: string, name: string, args: string): AiToolCall {
  let parsed: unknown = args;
  try {
    parsed = args.trim() ? JSON.parse(args) : {};
  } catch {
    logger.warn({ tool: name }, 'Tool call arguments are not valid JSON');
  }
  return { id, name, arguments: parsed };
}

function finishReason(reason: string | null | undefined): AiFinishReason {
  switch (reason) {
    case 'stop':
    case null:
    case undefined:
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
    case 'function_call':
      return 'tool-calls';
    case 'content_filter':
      return 'content-filter';
    default:
      return 'other';
  }
}

function usage(value: ChatUsage | null | undefined): AiUsage | undefined {
  if (!value) {
    return undefined;
  }
  const result: AiUsage = {
    inputTokens: value.prompt_tokens ?? 0,
    outputTokens: value.completion_tokens ?? 0,
    totalTokens:
      value.total_tokens ??
      (value.prompt_tokens ?? 0) + (value.completion_tokens ?? 0)
  };
  const cached = value.prompt_tokens_details?.cached_tokens;
  const reasoning = value.completion_tokens_details?.reasoning_tokens;
  if (cached) {
    result.cachedInputTokens = cached;
  }
  if (reasoning) {
    result.reasoningTokens = reasoning;
  }
  return result;
}

/** The options of a request, without the undefined ones the SDK refuses. */
function requestOptions(options: AiCallOptions) {
  return {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.timeout !== undefined ? { timeout: options.timeout } : {})
  };
}

function dataUrl(mimeType: string | undefined, data: string | undefined) {
  return `data:${mimeType ?? 'application/octet-stream'};base64,${data ?? ''}`;
}

/** The JSON Schema of a TypeBox schema, without its symbols. */
function jsonSchema(schema: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(schema));
}
