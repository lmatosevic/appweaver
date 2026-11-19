import { TSchema } from '@sinclair/typebox';

/** A text part of a message. */
export type AiTextPart = { type: 'text'; text: string };

/** An image part of a user message, given by its URL or its base64 data. */
export type AiImagePart = {
  type: 'image';
  /** The URL of the image, `https:` or a `data:` URL */
  url?: string;
  /** The base64 data of the image, with its `mimeType` */
  data?: string;
  /** The media type of the data, i.e. `image/png` */
  mimeType?: string;
  /** The level of detail the model reads the image in, where supported */
  detail?: 'low' | 'high' | 'auto';
};

/** A file part of a user message, i.e. a PDF, given by its base64 data or its URL. */
export type AiFilePart = {
  type: 'file';
  /** The media type of the file, i.e. `application/pdf` */
  mimeType: string;
  /** The base64 data of the file */
  data?: string;
  /** The URL of the file, where the endpoint downloads files */
  url?: string;
  /** The name of the file */
  name?: string;
};

/** A call of a tool requested by the model. */
export type AiToolCall = {
  /** The ID of the call, which its result refers to */
  id: string;
  /** The name of the tool */
  name: string;
  /** The arguments of the call, parsed from the JSON of the model, or the raw text when it is not valid JSON */
  arguments: unknown;
};

/** A tool call part of an assistant message. */
export type AiToolCallPart = { type: 'tool-call' } & AiToolCall;

/** The result of a tool call, sent back to the model in a tool message. */
export type AiToolResultPart = {
  type: 'tool-result';
  /** The ID of the call */
  id: string;
  /** The name of the tool */
  name: string;
  /** The result, a JSON value or a text */
  result: unknown;
  /** Whether the call failed, its result describing the error */
  isError?: boolean;
};

/** The reasoning of the model in an assistant message, never sent back to the model. */
export type AiReasoningPart = { type: 'reasoning'; text: string };

/** A part of a user message. */
export type AiUserPart = AiTextPart | AiImagePart | AiFilePart;

/** A part of an assistant message. */
export type AiAssistantPart = AiTextPart | AiToolCallPart | AiReasoningPart;

/** A message of a conversation with a model. */
export type AiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | AiUserPart[] }
  | { role: 'assistant'; content: string | AiAssistantPart[] }
  | { role: 'tool'; content: AiToolResultPart[] };

/** A tool the model may call, as the endpoint receives it. */
export type AiToolDefinition = {
  /** The name of the tool, i.e. `getWeather` */
  name: string;
  /** What the tool does, read by the model to decide when to call it */
  description?: string;
  /** The JSON Schema of the arguments, a TypeBox object */
  parameters: TSchema;
};

/** Which tool the model calls: any (`auto`), none, at least one (`required`), or the named one. */
export type AiToolChoice = 'auto' | 'none' | 'required' | { name: string };

/** The format of the output: text, any JSON object, or JSON matching a schema. */
export type AiResponseFormat =
  | { type: 'text' }
  | { type: 'json' }
  | { type: 'json-schema'; schema: TSchema; name?: string };

/** The effort of the reasoning of a reasoning model. */
export type AiReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

/** A capability a model may lack, checked before a request needing it is sent. */
export type AiCapability =
  | 'tools'
  | 'json'
  | 'json-schema'
  | 'images'
  | 'files'
  | 'reasoning'
  | 'embeddings';

/** Why the model stopped. */
export type AiFinishReason =
  | 'stop'
  | 'length'
  | 'tool-calls'
  | 'content-filter'
  | 'other';

/** The tokens of a call. */
export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** The input tokens read from the prompt cache of the provider */
  cachedInputTokens?: number;
  /** The output tokens of the reasoning */
  reasoningTokens?: number;
};

/** The request a driver sends to its endpoint. */
export type AiModelRequest = {
  /** The model name on the endpoint, i.e. `qwen3:8b` */
  model: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  seed?: number;
  tools?: AiToolDefinition[];
  toolChoice?: AiToolChoice;
  responseFormat?: AiResponseFormat;
  reasoning?: { effort: AiReasoningEffort };
  /** Parameters of the endpoint sent as they are, i.e. the `provider` routing of OpenRouter */
  providerOptions?: Record<string, unknown>;
};

/** The options of a driver call. */
export type AiCallOptions = {
  /** Aborts the call */
  signal?: AbortSignal;
  /** The timeout of the call in milliseconds */
  timeout?: number;
};

/** The response of a model to a request. */
export type AiModelResponse = {
  /** The text of the response, empty when the model only calls tools */
  text: string;
  /** The tool calls of the response */
  toolCalls: AiToolCall[];
  finishReason: AiFinishReason;
  /** The ID of the response at the provider */
  id?: string;
  /** The model that responded, as the provider names it */
  model?: string;
  /** The reasoning of the model, when the endpoint returns it */
  reasoning?: string;
  usage?: AiUsage;
};

/** A part of a streamed response. */
export type AiStreamPart =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call'; toolCall: AiToolCall }
  | {
      type: 'tool-result';
      toolCall: AiToolCall;
      result: unknown;
      isError?: boolean;
    }
  | {
      type: 'finish';
      finishReason: AiFinishReason;
      usage?: AiUsage;
      id?: string;
      model?: string;
    };

/** The request of embeddings a driver sends to its endpoint. */
export type AiEmbedRequest = {
  /** The model name on the endpoint */
  model: string;
  /** The texts to embed */
  input: string[];
  /** The dimensions of the vectors, for a model supporting fewer */
  dimensions?: number;
  /** Parameters of the endpoint sent as they are */
  providerOptions?: Record<string, unknown>;
};

/** The embeddings of the texts. */
export type AiEmbedResponse = {
  /** A vector per text, in their order */
  embeddings: number[][];
  /** The model that embedded, as the provider names it */
  model?: string;
  usage?: { inputTokens: number };
};
