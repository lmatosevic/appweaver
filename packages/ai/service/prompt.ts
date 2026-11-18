import { Static, TSchema } from '@sinclair/typebox';
import { AiTool } from '../tools/create-tool';
import {
  AiMessage,
  AiModelResponse,
  AiReasoningEffort,
  AiResponseFormat,
  AiToolChoice,
  AiToolResultPart,
  AiUsage,
  AiUserPart
} from '../types';

/** A prompt rendered from a template of the template engine. */
export type AiTemplatePrompt = {
  /** The template name, with the `.md` format when it has none, i.e. `prompts/summarize` for `prompts/summarize.md` */
  template: string;
  /** The data to render the template with */
  data?: Record<string, unknown>;
  /** The locale to render the template in. Default: the `locale.default` config */
  locale?: string;
};

/** A call of a model: the model, the messages, and the parameters. */
export type AiPrompt = {
  /** A model reference (`local:qwen3:8b`) or an alias (`fast`). Default: `ai.defaultModel` */
  model?: string;
  /** The system prompt, a text or a template */
  system?: string | AiTemplatePrompt;
  /** The user message added after the `messages`, a text, a template, or its parts (i.e. with images) */
  prompt?: string | AiTemplatePrompt | AiUserPart[];
  /** The conversation so far */
  messages?: AiMessage[];
  /** The maximum output tokens. Default: `ai.maxTokens` */
  maxTokens?: number;
  /** The temperature. Default: `ai.temperature` */
  temperature?: number;
  topP?: number;
  stop?: string[];
  seed?: number;
  /** The reasoning effort of a reasoning model */
  reasoning?: AiReasoningEffort;
  /** The tools the model may call, or the names of the tools of `createAiTool` */
  tools?: (AiTool<any, any> | string)[];
  toolChoice?: AiToolChoice;
  /** The maximum model calls running the tools the model calls. Default: `ai.maxSteps` */
  maxSteps?: number;
  /** The format of the output: text (the default), any JSON object, or JSON matching a schema */
  responseFormat?: AiResponseFormat;
  /** Parameters of the endpoint sent as they are, i.e. the `provider` routing of OpenRouter */
  providerOptions?: Record<string, unknown>;
  /** Aborts the call */
  signal?: AbortSignal;
  /** The timeout of a model request in milliseconds. Default: the one of the endpoint */
  timeout?: number;
};

/** A call of a model returning an object matching a schema. */
export type AiObjectPrompt<T extends TSchema> = Omit<
  AiPrompt,
  'responseFormat'
> & {
  /** The schema of the object, a TypeBox schema */
  schema: T;
  /** The name of the schema, sent to the endpoints naming it. Default: `response` */
  schemaName?: string;
  /** The calls repairing an object not matching the schema. Default: `ai.repairAttempts` */
  repairAttempts?: number;
};

/** A call of a model run by a worker of the `ai` queue: a JSON value, its tools named. */
export type AiQueuedPrompt = Omit<AiPrompt, 'signal' | 'tools'> & {
  /** The names of the tools of `createAiTool` */
  tools?: string[];
};

/** A model call of a call running tools, and the results of the tools it called. */
export type AiStep = {
  response: AiModelResponse;
  toolResults: AiToolResultPart[];
};

/** The response of a call, after the tools it called. */
export type AiResult = AiModelResponse & {
  /** The model reference that answered, i.e. the second model of an alias when the first failed */
  model: string;
  /** The model calls, one per step running tools */
  steps: AiStep[];
  /** The conversation with the response, to continue it */
  messages: AiMessage[];
  /** The tokens of every step */
  usage: AiUsage;
};

/** The response of a call returning an object. */
export type AiObjectResult<T extends TSchema> = AiResult & {
  object: Static<T>;
};

/** The embeddings of a call. */
export type AiEmbedResult = {
  /** A vector per text, in their order */
  embeddings: number[][];
  /** The model reference that embedded */
  model: string;
  usage?: { inputTokens: number };
};

/** The options of an embedding call. */
export type AiEmbedOptions = {
  /** A model reference or an alias. Default: `ai.defaultEmbeddingModel` */
  model?: string;
  /** The dimensions of the vectors, for a model supporting fewer */
  dimensions?: number;
  /** Parameters of the endpoint sent as they are */
  providerOptions?: Record<string, unknown>;
  signal?: AbortSignal;
  timeout?: number;
};
