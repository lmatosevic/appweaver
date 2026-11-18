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
  uuid
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
  AiToolCall,
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
  /** @internal */
  private readonly _localStreams = new Map<
    string,
    (message: unknown) => void
  >();

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
   * @throws {AiError} `AI_MODEL_UNKNOWN`, `AI_CAPABILITY_UNSUPPORTED` for a request the model cannot serve, or the
   * error of the driver.
   * @throws {TemplateError} `TEMPLATE_NOT_FOUND` for a missing prompt template.
   */
  public async generate(prompt: AiPrompt): Promise<AiResult> {
    const prepared = await this.prepare(prompt);
    return this.callModels(prompt.model, (model, driver) =>
      this.runSteps(model, driver, prepared)
    );
  }

  /**
   * Calls a model and streams its response, running the tools it calls between its steps. The models of an alias are
   * called in turn while one fails before streaming anything.
   *
   * @param {AiPrompt} prompt - The model, the messages and the parameters.
   * @return {AiStream} The stream of the text deltas, with the result once it ends.
   */
  public stream(prompt: AiPrompt): AiStream {
    return new AiStream(
      (signal) => this.streamModels(prompt, signal),
      prompt.signal
    );
  }

  /**
   * Calls a model for an object matching a schema: in the JSON schema mode of an endpoint supporting it, otherwise in
   * its JSON mode or by the instructions of the prompt. An object not matching the schema is sent back with its errors
   * for the model to repair, up to `repairAttempts` times.
   *
   * @param {AiObjectPrompt} prompt - The model, the messages, the parameters and the schema.
   * @return {Promise<AiObjectResult>} The object and the response.
   * @throws {AiError} `AI_OUTPUT_INVALID` when the object still does not match the schema, or see {@link generate}.
   */
  public async generateObject<T extends TSchema>(
    prompt: AiObjectPrompt<T>
  ): Promise<AiObjectResult<T>> {
    const prepared = await this.prepare(prompt);
    const attempts = prompt.repairAttempts ?? aiConfig.REPAIR_ATTEMPTS;
    return this.callModels(prompt.model, async (model, driver) => {
      const objectPrompt = this.objectPrompt(prepared, prompt, model, driver);
      let result = await this.runSteps(model, driver, objectPrompt);
      for (let attempt = 0; ; attempt++) {
        const checked = checkObject(prompt.schema, result.text);
        if (checked.valid) {
          return { ...result, object: checked.value as Static<T> };
        }
        if (attempt >= attempts) {
          throw new AiError(
            ErrorCode.AiOutputInvalid,
            `The output of the AI model '${model.reference}' does not match the schema`,
            { model: model.reference, errors: checked.errors }
          );
        }
        logger.debug(
          { model: model.reference, errors: checked.errors },
          'Repairing the AI object'
        );
        const repaired = await this.runSteps(model, driver, {
          ...objectPrompt,
          messages: [
            ...result.messages,
            {
              role: 'user',
              content: `The JSON does not match the schema: ${checked.errors.join('; ')}. Respond with the corrected JSON only.`
            }
          ]
        });
        result = mergeResults(result, repaired);
      }
    });
  }

  /**
   * Calls a model for an object matching a schema, streaming the object while it is generated. The object is checked
   * against the schema once it ends, without a repair.
   *
   * @param {AiObjectPrompt} prompt - The model, the messages, the parameters and the schema.
   * @return {AiObjectStream} The stream of the partial objects, with the object once it ends.
   */
  public streamObject<T extends TSchema>(
    prompt: AiObjectPrompt<T>
  ): AiObjectStream<T> {
    const stream = new AiStream<AiObjectResult<T>>(
      async function* (this: AiService, signal) {
        let resolved: ResolvedModel | undefined;
        const result: AiResult = yield* this.streamModels(
          prompt,
          signal,
          (prepared, model, driver) => {
            resolved = model;
            return this.objectPrompt(prepared, prompt, model, driver);
          }
        );
        const checked = checkObject(prompt.schema, result.text);
        if (!checked.valid) {
          throw new AiError(
            ErrorCode.AiOutputInvalid,
            `The output of the AI model '${resolved?.reference}' does not match the schema`,
            { model: resolved?.reference ?? '', errors: checked.errors }
          );
        }
        return { ...result, object: checked.value as Static<T> };
      }.bind(this),
      prompt.signal
    );
    return new AiObjectStream(stream);
  }

  /**
   * Classifies a text into one of the labels.
   *
   * @param {string} input - The text to classify.
   * @param {string[]} labels - The labels, at least two.
   * @param {Omit<AiPrompt, 'prompt'>} [prompt] - The model, the instructions in `system`, and the parameters.
   * @return {Promise<string>} The label.
   * @throws {AiError} `AI_REQUEST_INVALID` for fewer than two labels, or see {@link generateObject}.
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
    const system =
      typeof prompt.system === 'string' || !prompt.system
        ? [
            prompt.system,
            `Classify the input into exactly one of the labels: ${labels.join(', ')}.`
          ]
            .filter(Boolean)
            .join('\n\n')
        : prompt.system;
    const { object } = await this.generateObject({
      ...prompt,
      system,
      prompt: input,
      schema: Type.Object({
        label: Type.Union(labels.map((label) => Type.Literal(label)))
      })
    });
    return object.label;
  }

  /**
   * Embeds texts into vectors.
   *
   * @param {string | string[]} input - A text or the texts.
   * @param {AiEmbedOptions} [options] - The model, the dimensions and the parameters.
   * @return {Promise<AiEmbedResult>} A vector per text.
   * @throws {AiError} `AI_MODEL_UNKNOWN` without a model, `AI_CAPABILITY_UNSUPPORTED` for an endpoint without
   * embeddings, or the error of the driver.
   */
  public async embed(
    input: string | string[],
    options: AiEmbedOptions = {}
  ): Promise<AiEmbedResult> {
    const texts = Array.isArray(input) ? input : [input];
    const models = this._registry.resolve(
      options.model,
      aiConfig.DEFAULT_EMBEDDING_MODEL
    );
    return this.withFallbacks(models, async (model, driver) => {
      requireCapability(driver, model, 'embeddings');
      const request = {
        model: model.model,
        input: texts,
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
    });
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
   * Adds a call to the `ai` queue, run by a worker of any instance with the retries of the queue, i.e. a call whose
   * result is stored by a tool or an event listener.
   *
   * @param {AiQueuedPrompt} prompt - The prompt, a JSON value naming its tools.
   * @param {QueueJobOptions} [options] - The delay, the attempts and the priority of the job.
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
   * Runs a call through the `ai` queue and waits for its result, on whichever instance its worker runs, i.e. to
   * limit the calls running at once with `ai.queueConcurrency`.
   *
   * @param {AiQueuedPrompt} prompt - The prompt, a JSON value naming its tools.
   * @param {QueueJobOptions} [options] - The delay, the attempts and the priority of the job.
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
   * Runs a call through the `ai` queue and streams its response from whichever instance its worker runs, the parts
   * relayed through the `PubSub` in batches of `ai.streamFlushInterval`. The job is attempted once, since a stream
   * cannot restart, and aborting the stream aborts the call of the worker.
   *
   * @param {AiQueuedPrompt} prompt - The prompt, a JSON value naming its tools.
   * @param {QueueJobOptions & { signal?: AbortSignal }} [options] - The delay and the priority of the job, and the
   * signal aborting the stream.
   * @return {AiStream} The stream.
   */
  public streamQueued(
    prompt: AiQueuedPrompt,
    options: Omit<QueueJobOptions, 'attempts'> & { signal?: AbortSignal } = {}
  ): AiStream {
    const { signal: abortSignal, ...jobOptions } = options;
    return new AiStream(
      async function* (this: AiService, signal) {
        const queue = this.queue();
        const streamId = uuid();
        const parts = new AsyncQueue<AiStreamPart>();
        let result: AiResult | undefined;
        const unsubscribe = await this.subscribeStream(
          `ai:stream:${streamId}`,
          (message: AiStreamMessage) => {
            message.parts?.forEach((part) => parts.push(part));
            if (message.result) {
              result = message.result;
              parts.end();
            }
          }
        );
        const onAbort = () =>
          void this.publishStream(`ai:stream:${streamId}:cancel`, {});
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          this._results!.wait((jobId) =>
            queue.sendJob(
              { prompt: queuedPrompt(prompt), stream: streamId },
              'stream',
              { ...jobOptions, attempts: 1, jobId }
            )
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
          signal.removeEventListener('abort', onAbort);
          await unsubscribe();
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
        const name = typeof tool === 'string' ? tool : tool.name;
        throw new AiError(
          ErrorCode.AiRequestInvalid,
          `Unknown AI tool '${name}', create it with createAiTool`,
          { errors: [`tools: unknown tool '${name}'`] }
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
  private objectPrompt<T extends TSchema>(
    prepared: PreparedPrompt,
    prompt: AiObjectPrompt<T>,
    model: ResolvedModel,
    driver: AiDriver
  ): PreparedPrompt {
    let responseFormat: AiResponseFormat | undefined;
    let messages = prepared.messages;
    if (driver.supports('json-schema', model.model)) {
      responseFormat = {
        type: 'json-schema',
        schema: prompt.schema,
        name: prompt.schemaName ?? 'response'
      };
    } else {
      if (driver.supports('json', model.model)) {
        responseFormat = { type: 'json' };
      }
      messages = [
        {
          role: 'system',
          content: `Respond with only a JSON value matching this JSON Schema:\n${JSON.stringify(prompt.schema)}`
        },
        ...messages
      ];
    }
    return {
      ...prepared,
      messages,
      request: { ...prepared.request, responseFormat }
    };
  }

  /** @internal */
  private callModels<T>(
    model: string | undefined,
    call: (model: ResolvedModel, driver: AiDriver) => Promise<T>
  ): Promise<T> {
    return this.withFallbacks(this._registry.resolve(model), call);
  }

  /** @internal */
  private async withFallbacks<T>(
    models: ResolvedModel[],
    call: (model: ResolvedModel, driver: AiDriver) => Promise<T>
  ): Promise<T> {
    for (let i = 0; ; i++) {
      const model = models[i];
      try {
        return await call(model, await this._registry.driver(model.endpoint));
      } catch (error) {
        if (i === models.length - 1 || !isRetriable(error)) {
          throw error;
        }
        logger.warn(
          {
            model: model.reference,
            next: models[i + 1].reference,
            error: (error as Error).message
          },
          'AI model failed, calling the next model'
        );
      }
    }
  }

  /** @internal */
  private async runSteps(
    model: ResolvedModel,
    driver: AiDriver,
    prepared: PreparedPrompt
  ): Promise<AiResult> {
    const messages = [...prepared.messages];
    const steps: AiStep[] = [];
    for (let step = 1; ; step++) {
      const request: AiModelRequest = {
        ...prepared.request,
        model: model.model,
        messages: [...messages]
      };
      checkCapabilities(driver, model, request);
      this.logRequest(model, request);
      const trace = traceAiCall('chat', driver.endpoint, request);
      let response: AiModelResponse;
      try {
        response = await trace.run(() =>
          driver.generate(request, prepared.options)
        );
        trace.end(response);
      } catch (error) {
        trace.fail(error);
        throw error;
      }
      messages.push(assistantMessage(response));
      const toolResults = await this.runTools(
        response.toolCalls,
        prepared,
        messages,
        step
      );
      steps.push({ response, toolResults: toolResults ?? [] });
      if (!toolResults) {
        return this.result(model, steps, messages);
      }
      messages.push({ role: 'tool', content: toolResults });
    }
  }

  /** @internal */
  private async *streamModels(
    prompt: AiPrompt,
    signal: AbortSignal,
    decorate?: (
      prepared: PreparedPrompt,
      model: ResolvedModel,
      driver: AiDriver
    ) => PreparedPrompt
  ): AsyncGenerator<AiStreamPart, AiResult> {
    const prepared = await this.prepare({ ...prompt, signal });
    const models = this._registry.resolve(prompt.model);
    for (let i = 0; ; i++) {
      const model = models[i];
      let streamed = false;
      try {
        const driver = await this._registry.driver(model.endpoint);
        const parts = this.streamSteps(
          model,
          driver,
          decorate ? decorate(prepared, model, driver) : prepared
        );
        while (true) {
          const next = await parts.next();
          if (next.done) {
            return next.value;
          }
          streamed = true;
          yield next.value;
        }
      } catch (error) {
        if (streamed || i === models.length - 1 || !isRetriable(error)) {
          throw error;
        }
        logger.warn(
          {
            model: model.reference,
            next: models[i + 1].reference,
            error: (error as Error).message
          },
          'AI model failed, streaming the next model'
        );
      }
    }
  }

  /** @internal */
  private async *streamSteps(
    model: ResolvedModel,
    driver: AiDriver,
    prepared: PreparedPrompt
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
      this.logRequest(model, request);
      const trace = traceAiCall('chat', driver.endpoint, request);
      const response: AiModelResponse = {
        text: '',
        toolCalls: [],
        finishReason: 'stop'
      };
      try {
        for await (const part of driver.stream(request, prepared.options)) {
          if (part.type === 'text-delta') {
            response.text += part.text;
            yield part;
          } else if (part.type === 'reasoning-delta') {
            response.reasoning = (response.reasoning ?? '') + part.text;
            yield part;
          } else if (part.type === 'tool-call') {
            response.toolCalls.push(part.toolCall);
            yield part;
          } else if (part.type === 'finish') {
            Object.assign(response, {
              finishReason: part.finishReason,
              usage: part.usage,
              id: part.id,
              model: part.model
            });
          }
        }
        trace.end(response);
      } catch (error) {
        trace.fail(error);
        throw error;
      }
      messages.push(assistantMessage(response));
      const toolResults = await this.runTools(
        response.toolCalls,
        prepared,
        messages,
        step
      );
      steps.push({ response, toolResults: toolResults ?? [] });
      for (const part of toolResults ?? []) {
        yield {
          type: 'tool-result',
          toolCall: response.toolCalls.find((call) => call.id === part.id)!,
          result: part.result,
          isError: part.isError
        };
      }
      if (!toolResults) {
        const result = this.result(model, steps, messages);
        yield {
          type: 'finish',
          finishReason: result.finishReason,
          usage: result.usage,
          id: result.id,
          model: result.model
        };
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
    toolCalls: AiToolCall[],
    prepared: PreparedPrompt,
    messages: AiMessage[],
    step: number
  ): Promise<AiToolResultPart[] | undefined> {
    if (!toolCalls.length || step >= prepared.maxSteps) {
      return undefined;
    }
    const tools = new Map(prepared.tools.map((tool) => [tool.name, tool]));
    if (
      toolCalls.some(
        (call) => tools.has(call.name) && !tools.get(call.name)!.execute
      )
    ) {
      return undefined;
    }
    return Promise.all(
      toolCalls.map((call) =>
        this.runTool(
          call,
          tools.get(call.name),
          messages,
          prepared.options.signal
        )
      )
    );
  }

  /** @internal */
  private async runTool(
    toolCall: AiToolCall,
    tool: AiTool | undefined,
    messages: AiMessage[],
    signal?: AbortSignal
  ): Promise<AiToolResultPart> {
    const failed = (message: string): AiToolResultPart => ({
      type: 'tool-result',
      id: toolCall.id,
      name: toolCall.name,
      result: message,
      isError: true
    });
    if (!tool) {
      return failed(`Unknown tool '${toolCall.name}'`);
    }
    const args = Value.Convert(
      tool.parameters,
      Value.Default(tool.parameters, structuredClone(toolCall.arguments ?? {}))
    );
    const errors = schemaErrors(tool.parameters, args);
    if (errors.length) {
      return failed(`Invalid arguments: ${errors.join('; ')}`);
    }
    try {
      const result = await traceToolCall(toolCall, async () =>
        tool.execute!(args, { toolCall, messages, signal })
      );
      return {
        type: 'tool-result',
        id: toolCall.id,
        name: toolCall.name,
        result: result ?? null
      };
    } catch (error) {
      signal?.throwIfAborted();
      logger.warn(
        { tool: toolCall.name, error: (error as Error).message },
        'AI tool failed'
      );
      return failed(`The tool failed: ${(error as Error).message}`);
    }
  }

  /** @internal */
  private result(
    model: ResolvedModel,
    steps: AiStep[],
    messages: AiMessage[]
  ): AiResult {
    const last = steps[steps.length - 1].response;
    const result: AiResult = {
      ...last,
      model: model.reference,
      steps,
      messages,
      usage: sumUsage(steps.map((step) => step.response.usage))
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
    return result;
  }

  /** @internal */
  private logRequest(model: ResolvedModel, request: AiModelRequest): void {
    if (aiConfig.LOG_PROMPTS) {
      logger.debug(
        { model: model.reference, messages: request.messages },
        'AI request'
      );
    }
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
  private async processJob(job: QueueJob<AiJob, AiResult>): Promise<AiResult> {
    const { prompt, stream } = job.data;
    if (!stream) {
      return this.generate(prompt);
    }

    const controller = new AbortController();
    const unsubscribe = await this.subscribeStream(
      `ai:stream:${stream}:cancel`,
      () => controller.abort()
    );
    const channel = `ai:stream:${stream}`;
    let buffer: AiStreamPart[] = [];
    let flushed = Promise.resolve();
    const flush = () => {
      if (buffer.length) {
        const parts = buffer;
        buffer = [];
        flushed = flushed.then(() => this.publishStream(channel, { parts }));
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
      await this.publishStream(channel, { result });
      return result;
    } finally {
      clearInterval(timer);
      await unsubscribe();
    }
  }

  /** @internal */
  private async subscribeStream(
    channel: string,
    handler: (message: any) => void
  ): Promise<() => Promise<void>> {
    if (this._pubsub) {
      const id = await this._pubsub.subscribe(channel, handler);
      return async () => {
        await this._pubsub!.unsubscribe(id);
      };
    }
    this._localStreams.set(channel, handler);
    return async () => {
      this._localStreams.delete(channel);
    };
  }

  /** @internal */
  private async publishStream(
    channel: string,
    message: unknown
  ): Promise<void> {
    if (this._pubsub) {
      await this._pubsub.publish(channel, message);
    } else {
      this._localStreams.get(channel)?.(structuredClone(message));
    }
  }
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

function sumUsage(usages: (AiUsage | undefined)[]): AiUsage {
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

/** The result of a repair, with the steps and the tokens of the attempts before it. */
function mergeResults(previous: AiResult, repaired: AiResult): AiResult {
  const steps = [...previous.steps, ...repaired.steps];
  return {
    ...repaired,
    steps,
    usage: sumUsage(steps.map((step) => step.response.usage))
  };
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

function isRetriable(error: unknown): boolean {
  return isAppweaverError(error) && RETRIABLE.has(error.code);
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
