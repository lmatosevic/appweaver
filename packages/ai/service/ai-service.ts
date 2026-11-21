import { Static, TSchema, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  AiError,
  ConfigurationError,
  createLogger,
  ErrorCode,
  HEALTH_CHECK,
  HealthCheckConfig,
  HealthCheckResult,
  IHealthCheck,
  isAppweaverError,
  LIFECYCLE,
  OnInit,
  PubSub,
  Queue,
  QueueJob,
  QueueJobOptions,
  TemplateEngine,
  TemplateError,
  uuidv4
} from '@appweaver/common';
import { inject, JobErrorData, JobResults } from '@appweaver/core';
import { aiConfig } from '../config';
import { AiDriver } from '../driver/ai-driver';
import { ModelRegistry, ResolvedModel } from '../driver/model-registry';
import { AiTool, findAiTool, validateToolName } from '../tools/create-tool';
import {
  AiCallOptions,
  AiCapability,
  AiMessage,
  AiModelRequest,
  AiModelResponse,
  AiResponseFormat,
  AiStreamPart,
  AiToolResultPart,
  AiUsage
} from '../types';
import { AsyncQueue } from '../utils/async-queue';
import { parseJsonOutput, schemaErrors } from '../utils/json-util';
import { traceAiCall, traceToolCall } from '../utils/telemetry';
import { AiObjectStream } from './ai-object-stream';
import { AiStream } from './ai-stream';
import {
  AiEmbedOptions,
  AiEmbedResult,
  AiObjectPrompt,
  AiObjectResult,
  AiPrompt,
  AiQueuedPrompt,
  AiResult,
  AiStep,
  AiTemplatePrompt
} from './prompt';

const logger = createLogger('ai');

/** The errors another model of an alias may not have. */
const RETRIABLE = new Set<string>([
  ErrorCode.AiRateLimited,
  ErrorCode.AiTimeout,
  ErrorCode.AiProviderUnavailable
]);

/** The job of the `ai` queue. */
type AiJob = {
  prompt: AiQueuedPrompt;
  /** The ID of the stream the parts are published to, for a queued stream */
  stream?: string;
};

/** A message of a queued stream: parts, then the result. */
type AiStreamMessage = { parts?: AiStreamPart[]; result?: AiResult };

/** Changes the prepared prompt for the driver of a model, i.e. its response format. */
type Decorate = (
  prepared: PreparedPrompt,
  driver: AiDriver,
  model: string
) => PreparedPrompt;

/** A prompt with its templates rendered and its tools found. */
type PreparedPrompt = {
  messages: AiMessage[];
  tools: AiTool[];
  request: Omit<AiModelRequest, 'model' | 'messages'>;
  options: AiCallOptions;
  maxSteps: number;
};

/**
 * Calls the models of the endpoints of the `ai` config: a whole response, a stream, an object matching a schema, a
 * classification or embeddings, directly or through the `ai` queue, running the tools the model calls.
 *
 * @example
 * const ai = inject(AiService);
 * const { text } = await ai.generate({ model: 'fast', prompt: 'Summarize: ...' });
 */
export class AiService implements OnInit, IHealthCheck {
  static [LIFECYCLE] = true;
  static [HEALTH_CHECK] = true;

  /** @internal */
  private readonly _registry = new ModelRegistry();
  /** @internal */
  private readonly _templateEngine = inject(TemplateEngine, false);
  /** @internal */
  private readonly _pubsub = inject(PubSub, false);
  /** @internal */
  private readonly _queue = inject(Queue, false)?.get<AiJob, AiResult>('ai');
  /** @internal */
  private readonly _results = this._queue
    ? new JobResults(this._queue, 'ai', { toError: aiError })
    : undefined;

  constructor() {
    this._queue?.addWorker(this.processJob.bind(this), {
      concurrency: aiConfig.QUEUE_CONCURRENCY
    });
  }

  /**
   * Checks that the default models and the aliases name configured endpoints.
   *
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` listing the invalid models.
   */
  public async onInit(): Promise<void> {
    const errors = this._registry.validate();
    if (errors.length) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `Invalid AI config: ${errors.join('; ')}`,
        { errors }
      );
    }
  }

  /**
   * Calls a model and returns its whole response, after running the tools it calls. The models of an alias are
   * called in turn while one fails with a rate limit, a timeout or an unavailable provider.
   *
   * @param {AiPrompt} prompt - The model, the messages and the parameters.
   * @return {Promise<AiResult>} The response, its steps and the conversation.
   * @throws {AiError} The error of the request or of the driver.
   */
  public async generate(prompt: AiPrompt): Promise<AiResult> {
    return drain(this.run(prompt, false));
  }

  /**
   * Calls a model and streams its response, running the tools it calls between its steps. The models of an alias are
   * called in turn while one fails before streaming anything.
   *
   * @param {AiPrompt} prompt - The model, the messages and the parameters.
   * @return {AiStream} The text deltas, with the result once it ends.
   */
  public stream(prompt: AiPrompt): AiStream {
    return new AiStream(
      (signal) => this.run({ ...prompt, signal }, true),
      prompt.signal
    );
  }

  /**
   * Calls a model for an object matching a schema, in the JSON schema mode of the endpoint when it has one. An object
   * not matching the schema is sent back with its errors for the model to repair, up to `repairAttempts` times.
   *
   * @param {AiObjectPrompt} prompt - The model, the messages, the parameters and the schema.
   * @return {Promise<AiObjectResult>} The object and the response.
   * @throws {AiError} `AI_OUTPUT_INVALID` when the object still does not match the schema.
   */
  public async generateObject<T extends TSchema>(
    prompt: AiObjectPrompt<T>
  ): Promise<AiObjectResult<T>> {
    const attempts = prompt.repairAttempts ?? aiConfig.REPAIR_ATTEMPTS;
    let result = await drain(this.run(prompt, false, objectFormat(prompt)));
    for (let attempt = 0; ; attempt++) {
      const checked = checkObject(prompt.schema, result.text);
      if (checked.valid) {
        return { ...result, object: checked.value as Static<T> };
      }
      if (attempt >= attempts) {
        throw outputInvalid(result.model, checked.errors);
      }
      logger.debug(
        { model: result.model, errors: checked.errors },
        'Repairing the AI object'
      );
      const repaired = await drain(
        this.run(
          {
            ...prompt,
            model: result.model,
            system: undefined,
            prompt: undefined,
            messages: [
              ...result.messages,
              {
                role: 'user',
                content: `The JSON does not match the schema: ${checked.errors.join('; ')}. Respond with the corrected JSON only.`
              }
            ]
          },
          false,
          objectFormat(prompt)
        )
      );
      const steps = [...result.steps, ...repaired.steps];
      result = { ...repaired, steps, usage: sumUsage(steps) };
    }
  }

  /**
   * Calls a model for an object matching a schema, streaming the object while it is generated. The object is checked
   * once it ends, without a repair.
   *
   * @param {AiObjectPrompt} prompt - The model, the messages, the parameters and the schema.
   * @return {AiObjectStream} The partial objects, with the object once it ends.
   */
  public streamObject<T extends TSchema>(
    prompt: AiObjectPrompt<T>
  ): AiObjectStream<T> {
    const run = (signal: AbortSignal) =>
      this.run({ ...prompt, signal }, true, objectFormat(prompt));
    return new AiObjectStream(
      new AiStream<AiObjectResult<T>>(async function* (signal) {
        const result = yield* run(signal);
        const checked = checkObject(prompt.schema, result.text);
        if (!checked.valid) {
          throw outputInvalid(result.model, checked.errors);
        }
        return { ...result, object: checked.value as Static<T> };
      }, prompt.signal)
    );
  }

  /**
   * Classifies a text into one of the labels.
   *
   * @param {string} input - The text to classify.
   * @param {string[]} labels - The labels, at least two.
   * @param {AiPrompt} [prompt] - The model, the instructions in `system`, and the parameters.
   * @return {Promise<string>} The label.
   * @throws {AiError} `AI_REQUEST_INVALID` for fewer than two labels.
   */
  public async classify<L extends string>(
    input: string,
    labels: readonly L[],
    prompt: Omit<AiPrompt, 'prompt' | 'responseFormat'> = {}
  ): Promise<L> {
    if (labels.length < 2) {
      throw new AiError(
        ErrorCode.AiRequestInvalid,
        'Classifying needs at least two labels',
        { errors: ['labels: expected at least two'] }
      );
    }
    const instruction = `Classify the input into exactly one of the labels: ${labels.join(', ')}.`;
    const { object } = await this.generateObject({
      ...prompt,
      system:
        typeof prompt.system === 'object'
          ? prompt.system
          : [prompt.system, instruction].filter(Boolean).join('\n\n'),
      prompt: input,
      schema: Type.Object({
        label: Type.Union(labels.map((label) => Type.Literal(label)))
      })
    });
    return object.label;
  }

  /**
   * Embeds texts into vectors, with `ai.defaultEmbeddingModel` when no model is given.
   *
   * @param {string | string[]} input - A text or the texts.
   * @param {AiEmbedOptions} [options] - The model, the dimensions and the parameters.
   * @return {Promise<AiEmbedResult>} A vector per text.
   * @throws {AiError} `AI_CAPABILITY_UNSUPPORTED` for an endpoint without embeddings.
   */
  public async embed(
    input: string | string[],
    options: AiEmbedOptions = {}
  ): Promise<AiEmbedResult> {
    const models = this._registry.resolve(
      options.model,
      aiConfig.DEFAULT_EMBEDDING_MODEL
    );
    for (let i = 0; ; i++) {
      const model = models[i];
      try {
        const driver = await this._registry.driver(model.endpoint);
        requireCapability(driver, model, 'embeddings');
        const request = {
          model: model.model,
          input: Array.isArray(input) ? input : [input],
          dimensions: options.dimensions,
          providerOptions: options.providerOptions
        };
        const trace = traceAiCall('embeddings', driver.endpoint, request);
        try {
          const response = await trace.run(() =>
            driver.embed(request, {
              signal: options.signal,
              timeout: options.timeout
            })
          );
          trace.end({
            model: response.model,
            finishReason: 'stop',
            usage: { inputTokens: response.usage?.inputTokens }
          });
          return { ...response, model: model.reference };
        } catch (error) {
          trace.fail(error);
          throw error;
        }
      } catch (error) {
        nextModel(models, i, error);
      }
    }
  }

  /**
   * Tells whether a model has a capability, i.e. to send images only to a model reading them.
   *
   * @param {string | undefined} model - A model reference or an alias, the default model when none is given.
   * @param {AiCapability} capability - The capability.
   * @return {Promise<boolean>} `true` when the first model of the alias has it.
   */
  public async supports(
    model: string | undefined,
    capability: AiCapability
  ): Promise<boolean> {
    const [resolved] = this._registry.resolve(model);
    const driver = await this._registry.driver(resolved.endpoint);
    return driver.supports(capability, resolved.model);
  }

  /**
   * Adds a call to the `ai` queue, run by a worker of any instance with the retries of the queue.
   *
   * @param {AiQueuedPrompt} prompt - The prompt, a JSON value naming its tools.
   * @param {QueueJobOptions} [options] - The options of the job.
   * @return {Promise<string | undefined>} The ID of the job.
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` without a queue.
   */
  public async enqueue(
    prompt: AiQueuedPrompt,
    options?: QueueJobOptions
  ): Promise<string | undefined> {
    const job = await this.queue().sendJob(
      { prompt: queuedPrompt(prompt) },
      'generate',
      options
    );
    return job.id;
  }

  /**
   * Runs a call through the `ai` queue and waits for its result, on whichever instance its worker runs.
   *
   * @param {AiQueuedPrompt} prompt - The prompt, a JSON value naming its tools.
   * @param {QueueJobOptions} [options] - The options of the job.
   * @return {Promise<AiResult>} The result.
   * @throws {AiError} The error of the last attempt.
   */
  public async generateQueued(
    prompt: AiQueuedPrompt,
    options?: QueueJobOptions
  ): Promise<AiResult> {
    const data = { prompt: queuedPrompt(prompt) };
    const queue = this.queue();
    return this._results!.wait((jobId) =>
      queue.sendJob(data, 'generate', { ...options, jobId })
    );
  }

  /**
   * Runs a call through the `ai` queue and streams it from the worker, the parts relayed through the `PubSub` in
   * batches of `ai.streamFlushInterval`. The job is attempted once, and aborting the stream aborts the worker's call.
   *
   * @param {AiQueuedPrompt} prompt - The prompt, a JSON value naming its tools.
   * @param {QueueJobOptions} [options] - The options of the job, and the signal aborting the stream.
   * @return {AiStream} The stream.
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` without a queue or a pub/sub.
   */
  public streamQueued(
    prompt: AiQueuedPrompt,
    options: Omit<QueueJobOptions, 'attempts'> & { signal?: AbortSignal } = {}
  ): AiStream {
    const { signal: abortSignal, ...jobOptions } = options;
    const data = { prompt: queuedPrompt(prompt), stream: uuidv4() };
    const channel = `ai:stream:${data.stream}`;
    return new AiStream(
      async function* (this: AiService, signal) {
        const queue = this.queue();
        const pubsub = this.pubsub();
        const parts = new AsyncQueue<AiStreamPart>();
        let result: AiResult | undefined;
        const id = await pubsub.subscribe<AiStreamMessage>(
          channel,
          (message) => {
            message.parts?.forEach((part) => parts.push(part));
            if (message.result) {
              result = message.result;
              parts.end();
            }
          }
        );
        const cancel = () => void pubsub.publish(`${channel}:cancel`, {});
        signal.addEventListener('abort', cancel, { once: true });
        try {
          this._results!.wait((jobId) =>
            queue.sendJob(data, 'stream', { ...jobOptions, attempts: 1, jobId })
          ).then(
            (completed) => {
              result ??= completed;
              parts.end();
            },
            (error) => parts.fail(error)
          );
          for await (const part of parts) {
            signal.throwIfAborted();
            yield part;
          }
          signal.throwIfAborted();
          return result!;
        } finally {
          signal.removeEventListener('abort', cancel);
          await pubsub.unsubscribe(id);
        }
      }.bind(this),
      abortSignal
    );
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    const failed: string[] = [];
    for (const name of aiConfig.HEALTH_CHECK_ENDPOINTS) {
      try {
        const result = await (await this._registry.driver(name)).checkHealth();
        if (!result.success) {
          failed.push(`${name}: ${result.message ?? 'unavailable'}`);
        }
      } catch (error) {
        failed.push(`${name}: ${(error as Error).message}`);
      }
    }
    return failed.length
      ? { success: false, message: failed.join('; ') }
      : { success: true };
  }

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'ai' };
  }

  /**
   * Calls the models of a prompt in turn, while one fails with a retriable error before it streamed anything.
   *
   * @internal
   */
  private async *run(
    prompt: AiPrompt,
    stream: boolean,
    decorate?: Decorate
  ): AsyncGenerator<AiStreamPart, AiResult> {
    const prepared = await this.prepare(prompt);
    const models = this._registry.resolve(prompt.model);
    for (let i = 0; ; i++) {
      const model = models[i];
      let streamed = false;
      try {
        const driver = await this._registry.driver(model.endpoint);
        const steps = this.steps(
          model,
          driver,
          decorate ? decorate(prepared, driver, model.model) : prepared,
          stream
        );
        while (true) {
          const next = await steps.next();
          if (next.done) {
            return next.value;
          }
          streamed = true;
          yield next.value;
        }
      } catch (error) {
        nextModel(models, i, error, streamed);
      }
    }
  }

  /**
   * Calls a model, then again with the results of the tools it calls, until it answers or the steps run out.
   *
   * @internal
   */
  private async *steps(
    model: ResolvedModel,
    driver: AiDriver,
    prepared: PreparedPrompt,
    stream: boolean
  ): AsyncGenerator<AiStreamPart, AiResult> {
    const messages = [...prepared.messages];
    const steps: AiStep[] = [];
    for (let step = 1; ; step++) {
      const request: AiModelRequest = {
        ...prepared.request,
        model: model.model,
        messages: [...messages]
      };
      checkCapabilities(driver, model, request);
      if (aiConfig.LOG_PROMPTS) {
        logger.debug({ model: model.reference, messages }, 'AI request');
      }
      const trace = traceAiCall('chat', driver.endpoint, request);
      let response: AiModelResponse;
      try {
        response = stream
          ? yield* streamResponse(driver.stream(request, prepared.options))
          : await trace.run(() => driver.generate(request, prepared.options));
        trace.end(response);
      } catch (error) {
        trace.fail(error);
        throw error;
      }
      messages.push(assistantMessage(response));
      const toolResults = await this.runTools(
        response,
        prepared,
        messages,
        step
      );
      steps.push({ response, toolResults: toolResults ?? [] });
      if (stream) {
        for (const part of toolResults ?? []) {
          const toolCall = response.toolCalls.find(
            (call) => call.id === part.id
          )!;
          yield {
            type: 'tool-result',
            toolCall,
            result: part.result,
            isError: part.isError
          };
        }
      }
      if (!toolResults) {
        const result: AiResult = {
          ...response,
          model: model.reference,
          steps,
          messages,
          usage: sumUsage(steps)
        };
        logger.debug(
          {
            model: model.reference,
            steps: steps.length,
            finishReason: result.finishReason,
            usage: result.usage,
            ...(aiConfig.LOG_PROMPTS ? { text: result.text } : {})
          },
          'AI call completed'
        );
        if (stream) {
          const { finishReason, usage, id } = result;
          yield {
            type: 'finish',
            finishReason,
            usage,
            id,
            model: response.model
          };
        }
        return result;
      }
      messages.push({ role: 'tool', content: toolResults });
    }
  }

  /**
   * Runs the tool calls of a step, `undefined` when the call ends: without tool calls, with a call of a tool without
   * `execute`, or on the last step.
   *
   * @internal
   */
  private async runTools(
    response: AiModelResponse,
    prepared: PreparedPrompt,
    messages: AiMessage[],
    step: number
  ): Promise<AiToolResultPart[] | undefined> {
    const tools = new Map(prepared.tools.map((tool) => [tool.name, tool]));
    const calls = response.toolCalls;
    if (
      !calls.length ||
      step >= prepared.maxSteps ||
      calls.some(
        (call) => tools.has(call.name) && !tools.get(call.name)!.execute
      )
    ) {
      return undefined;
    }
    const signal = prepared.options.signal;
    return Promise.all(
      calls.map(async (toolCall): Promise<AiToolResultPart> => {
        const tool = tools.get(toolCall.name);
        const part = {
          type: 'tool-result' as const,
          id: toolCall.id,
          name: toolCall.name
        };
        if (!tool) {
          return {
            ...part,
            result: `Unknown tool '${toolCall.name}'`,
            isError: true
          };
        }
        const args = Value.Convert(
          tool.parameters,
          Value.Default(
            tool.parameters,
            structuredClone(toolCall.arguments ?? {})
          )
        );
        const errors = schemaErrors(tool.parameters, args);
        if (errors.length) {
          return {
            ...part,
            result: `Invalid arguments: ${errors.join('; ')}`,
            isError: true
          };
        }
        try {
          const result = await traceToolCall(toolCall, async () =>
            tool.execute!(args, { toolCall, messages, signal })
          );
          return { ...part, result: result ?? null };
        } catch (error) {
          signal?.throwIfAborted();
          logger.warn(
            { tool: toolCall.name, error: (error as Error).message },
            'AI tool failed'
          );
          return {
            ...part,
            result: `The tool failed: ${(error as Error).message}`,
            isError: true
          };
        }
      })
    );
  }

  /** @internal */
  private async prepare(prompt: AiPrompt): Promise<PreparedPrompt> {
    const messages: AiMessage[] = [];
    if (prompt.system !== undefined) {
      messages.push({
        role: 'system',
        content: await this.renderPrompt(prompt.system)
      });
    }
    messages.push(...(prompt.messages ?? []));
    if (prompt.prompt !== undefined) {
      messages.push({
        role: 'user',
        content: Array.isArray(prompt.prompt)
          ? prompt.prompt
          : await this.renderPrompt(prompt.prompt)
      });
    }
    if (!messages.length) {
      throw new AiError(
        ErrorCode.AiRequestInvalid,
        'An AI prompt needs a system prompt, a prompt or messages',
        { errors: ['prompt: expected a prompt or messages'] }
      );
    }

    const tools = (prompt.tools ?? []).map((tool) => {
      const found = typeof tool === 'string' ? findAiTool(tool) : tool;
      if (!found) {
        throw new AiError(
          ErrorCode.AiRequestInvalid,
          `Unknown AI tool '${tool as string}', create it with createAiTool`,
          { errors: [`tools: unknown tool '${tool as string}'`] }
        );
      }
      validateToolName(found.name);
      return found;
    });

    return {
      messages,
      tools,
      maxSteps: Math.max(1, prompt.maxSteps ?? aiConfig.MAX_STEPS),
      options: { signal: prompt.signal, timeout: prompt.timeout },
      request: {
        maxTokens: prompt.maxTokens ?? aiConfig.MAX_TOKENS,
        temperature: prompt.temperature ?? aiConfig.TEMPERATURE,
        topP: prompt.topP,
        stop: prompt.stop,
        seed: prompt.seed,
        reasoning: prompt.reasoning ? { effort: prompt.reasoning } : undefined,
        toolChoice: prompt.toolChoice,
        responseFormat: prompt.responseFormat,
        providerOptions: prompt.providerOptions,
        tools: tools.length
          ? tools.map(({ name, description, parameters }) => ({
              name,
              description,
              parameters
            }))
          : undefined
      }
    };
  }

  /** @internal */
  private async renderPrompt(
    prompt: string | AiTemplatePrompt
  ): Promise<string> {
    if (typeof prompt === 'string') {
      return prompt;
    }
    const engine = this._templateEngine;
    if (!engine) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `AI prompt template '${prompt.template}' requires a template engine`
      );
    }
    const name = /\.[a-z0-9]+$/i.test(prompt.template)
      ? prompt.template
      : `${prompt.template}.md`;
    if (!(await engine.hasTemplate(name, prompt.locale))) {
      throw new TemplateError(
        ErrorCode.TemplateNotFound,
        `AI prompt template '${name}' not found`,
        { template: name, locale: prompt.locale }
      );
    }
    return (
      await engine.render(name, prompt.data ?? {}, { locale: prompt.locale })
    ).trim();
  }

  /** @internal */
  private queue() {
    if (!this._queue) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        'The queued AI calls require a queue (queue.provider)'
      );
    }
    return this._queue;
  }

  /** @internal */
  private pubsub(): PubSub {
    if (!this._pubsub) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        'The queued AI streams require a pub/sub (pubsub.provider)'
      );
    }
    return this._pubsub;
  }

  /** @internal */
  private async processJob(job: QueueJob<AiJob, AiResult>): Promise<AiResult> {
    const { prompt, stream } = job.data;
    if (!stream) {
      return this.generate(prompt);
    }

    const pubsub = this.pubsub();
    const channel = `ai:stream:${stream}`;
    const controller = new AbortController();
    const id = await pubsub.subscribe(`${channel}:cancel`, () =>
      controller.abort()
    );
    let buffer: AiStreamPart[] = [];
    let flushed = Promise.resolve();
    const flush = () => {
      if (buffer.length) {
        const parts = buffer;
        buffer = [];
        flushed = flushed.then(() => pubsub.publish(channel, { parts }));
      }
    };
    const timer = setInterval(flush, aiConfig.STREAM_FLUSH_INTERVAL);
    try {
      const aiStream = this.stream({ ...prompt, signal: controller.signal });
      for await (const part of aiStream.parts()) {
        buffer.push(part);
      }
      const result = await aiStream.result;
      flush();
      await flushed;
      await pubsub.publish(channel, { result });
      return result;
    } finally {
      clearInterval(timer);
      await pubsub.unsubscribe(id);
    }
  }
}

/** Streams the parts of a model response, returning the response they make up. */
async function* streamResponse(
  parts: AsyncIterable<AiStreamPart>
): AsyncGenerator<AiStreamPart, AiModelResponse> {
  const response: AiModelResponse = {
    text: '',
    toolCalls: [],
    finishReason: 'stop'
  };
  for await (const part of parts) {
    if (part.type === 'finish') {
      const { finishReason, usage, id, model } = part;
      Object.assign(response, { finishReason, usage, id, model });
      continue;
    }
    if (part.type === 'text-delta') {
      response.text += part.text;
    } else if (part.type === 'reasoning-delta') {
      response.reasoning = (response.reasoning ?? '') + part.text;
    } else if (part.type === 'tool-call') {
      response.toolCalls.push(part.toolCall);
    }
    yield part;
  }
  return response;
}

/** Reads a generator to its end, returning its value. */
async function drain<T>(generator: AsyncGenerator<unknown, T>): Promise<T> {
  while (true) {
    const next = await generator.next();
    if (next.done) {
      return next.value;
    }
  }
}

/** Throws the error of a model unless the next model of the alias may not have it. */
function nextModel(
  models: ResolvedModel[],
  index: number,
  error: unknown,
  streamed = false
): void {
  const retriable = isAppweaverError(error) && RETRIABLE.has(error.code);
  if (streamed || !retriable || index === models.length - 1) {
    throw error;
  }
  logger.warn(
    {
      model: models[index].reference,
      next: models[index + 1].reference,
      error: (error as Error).message
    },
    'AI model failed, calling the next model'
  );
}

/** Asks for an object of the schema: the JSON schema mode, else the JSON mode or the instructions of the prompt. */
function objectFormat(prompt: AiObjectPrompt<TSchema>): Decorate {
  return (prepared, driver, model) => {
    if (driver.supports('json-schema', model)) {
      const name = prompt.schemaName ?? 'response';
      const responseFormat: AiResponseFormat = {
        type: 'json-schema',
        schema: prompt.schema,
        name
      };
      return { ...prepared, request: { ...prepared.request, responseFormat } };
    }
    const instruction = `Respond with only a JSON value matching this JSON Schema:\n${JSON.stringify(prompt.schema)}`;
    const instructed = prepared.messages.some(
      (message) => message.content === instruction
    );
    return {
      ...prepared,
      messages: instructed
        ? prepared.messages
        : [{ role: 'system', content: instruction }, ...prepared.messages],
      request: {
        ...prepared.request,
        responseFormat: driver.supports('json', model)
          ? { type: 'json' }
          : undefined
      }
    };
  };
}

function outputInvalid(model: string, errors: string[]): AiError {
  return new AiError(
    ErrorCode.AiOutputInvalid,
    `The output of the AI model '${model}' does not match the schema`,
    { model, errors }
  );
}

/** Checks that the model has the capabilities a request needs. */
function checkCapabilities(
  driver: AiDriver,
  model: ResolvedModel,
  request: AiModelRequest
): void {
  if (request.tools?.length) {
    requireCapability(driver, model, 'tools');
  }
  const format = request.responseFormat?.type;
  if (format === 'json' || format === 'json-schema') {
    requireCapability(driver, model, format);
  }
  if (request.reasoning) {
    requireCapability(driver, model, 'reasoning');
  }
  for (const message of request.messages) {
    if (message.role === 'user' && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'image') {
          requireCapability(driver, model, 'images');
        } else if (part.type === 'file') {
          requireCapability(driver, model, 'files');
        }
      }
    }
  }
}

function requireCapability(
  driver: AiDriver,
  model: ResolvedModel,
  capability: AiCapability
): void {
  if (!driver.supports(capability, model.model)) {
    throw new AiError(
      ErrorCode.AiCapabilityUnsupported,
      `The AI model '${model.reference}' does not support ${capability}, set the capabilities of the endpoint '${model.endpoint}' if it does`,
      { model: model.reference, capability }
    );
  }
}

/** The assistant message of a response, without its reasoning. */
function assistantMessage(response: AiModelResponse): AiMessage {
  if (!response.toolCalls.length) {
    return { role: 'assistant', content: response.text };
  }
  return {
    role: 'assistant',
    content: [
      ...(response.text
        ? [{ type: 'text' as const, text: response.text }]
        : []),
      ...response.toolCalls.map((call) => ({
        type: 'tool-call' as const,
        ...call
      }))
    ]
  };
}

function sumUsage(steps: AiStep[]): AiUsage {
  const usages = steps.map((step) => step.response.usage);
  const sum = (key: keyof AiUsage) => {
    const values = usages
      .map((usage) => usage?.[key])
      .filter((value): value is number => value !== undefined);
    return values.length ? values.reduce((a, b) => a + b, 0) : undefined;
  };
  const usage: AiUsage = {
    inputTokens: sum('inputTokens') ?? 0,
    outputTokens: sum('outputTokens') ?? 0,
    totalTokens: sum('totalTokens') ?? 0
  };
  const cached = sum('cachedInputTokens');
  const reasoning = sum('reasoningTokens');
  if (cached !== undefined) {
    usage.cachedInputTokens = cached;
  }
  if (reasoning !== undefined) {
    usage.reasoningTokens = reasoning;
  }
  return usage;
}

/** Parses the JSON of an output and checks it against a schema, filling in its defaults. */
function checkObject(
  schema: TSchema,
  text: string
): { valid: true; value: unknown } | { valid: false; errors: string[] } {
  let value: unknown;
  try {
    value = parseJsonOutput(text);
  } catch (error) {
    return {
      valid: false,
      errors: [`invalid JSON: ${(error as Error).message}`]
    };
  }
  value = Value.Default(schema, value);
  const errors = schemaErrors(schema, value);
  return errors.length ? { valid: false, errors } : { valid: true, value };
}

/** Checks that a queued prompt names its tools, carrying no functions. */
function queuedPrompt(prompt: AiQueuedPrompt): AiQueuedPrompt {
  const invalid = (prompt.tools ?? []).filter(
    (tool) => typeof tool !== 'string'
  );
  if (invalid.length) {
    throw new AiError(
      ErrorCode.AiRequestInvalid,
      'A queued AI prompt names its tools, created with createAiTool',
      { errors: ['tools: expected the names of the tools'] }
    );
  }
  return prompt;
}

/** Creates the error of a failed AI job, published by the instance that ran it. */
function aiError(data: JobErrorData): Error {
  if (data.code?.startsWith('AI_')) {
    return new AiError(
      data.code as ErrorCode.AiRequestFailed,
      data.message,
      (data.details ?? {}) as AiError<ErrorCode.AiRequestFailed>['details']
    );
  }
  const error = new Error(data.message);
  error.name = data.name ?? 'Error';
  return error;
}
