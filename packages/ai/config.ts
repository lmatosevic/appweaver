import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

/** An endpoint of the `ai.endpoints` config: a server speaking the API of a driver. */
export const aiEndpointSchema = Type.Object({
  /** The preset filling in the driver, the base URL, the API key variable and the capabilities, i.e. `ollama` or
   * `openrouter`. */
  preset: Type.Optional(Type.String()),
  /** The driver talking to the endpoint. Default: the driver of the preset, otherwise `openai`. */
  driver: Type.Optional(Type.String()),
  /** The base URL of the API, i.e. `http://localhost:11434/v1`. Default: the one of the preset. */
  baseUrl: Type.Optional(Type.String()),
  /** The API key. Default: the environment variable of the preset, i.e. `OPENROUTER_API_KEY`. */
  apiKey: Type.Optional(Type.String({ secret: true })),
  /** Headers sent with every request, as `Name: value` strings. */
  headers: Type.Optional(Type.Array(Type.String())),
  /** The capabilities of the models of the endpoint (`tools`, `json`, `json-schema`, `images`, `files`, `reasoning`,
   * `embeddings`). Default: the ones of the preset. */
  capabilities: Type.Optional(Type.Array(Type.String())),
  /** The timeout of a request in milliseconds. Default: `ai.timeout`. */
  timeout: Type.Optional(Type.Integer()),
  /** The retries of a failed request. Default: `ai.maxRetries`. */
  maxRetries: Type.Optional(Type.Integer())
});

export const aiConfig = defineConfig('ai', {
  /** The endpoints of the models by their names, the prefixes of the model references (`local:qwen3:8b` calls the
   * `qwen3:8b` model of the `local` endpoint), i.e. `{ "local": { "preset": "ollama" } }`. Each property is also read
   * from its own variable, i.e. `AI_ENDPOINTS_OPENROUTER_API_KEY`. The `mock` endpoint is built in. Default: `{}`. */
  ENDPOINTS: Type.Record(Type.String(), aiEndpointSchema, { default: {} }),
  /** The model of a call naming none, a model reference (`<endpoint>:<model>`) or an alias, i.e. `local:qwen3:8b`. */
  DEFAULT_MODEL: Type.Optional(Type.String()),
  /** The embedding model of a call naming none, a model reference or an alias, i.e. `local:nomic-embed-text`. */
  DEFAULT_EMBEDDING_MODEL: Type.Optional(Type.String()),
  /** Names of the models the code calls them by, i.e. `{ "fast": "local:qwen3:8b" }`, each a model reference or a
   * list of them tried in turn when one fails with a retriable error (comma-separated in a variable). Default: `{}`. */
  ALIASES: Type.Record(
    Type.String(),
    Type.Union([Type.String(), Type.Array(Type.String())]),
    { default: {} }
  ),
  /** The maximum output tokens of a call setting none. Default: the one of the model. */
  MAX_TOKENS: Type.Optional(Type.Integer()),
  /** The temperature of a call setting none. Default: the one of the model. */
  TEMPERATURE: Type.Optional(Type.Number()),
  /** The timeout of a request to a model in milliseconds. Default: `120000`. */
  TIMEOUT: Type.Integer({ default: 120000 }),
  /** The retries of a request failing with a rate limit, a timeout or a server error. Default: `2`. */
  MAX_RETRIES: Type.Integer({ default: 2 }),
  /** The maximum model calls of a call with tools: the model is called again with the results of the tools it called
   * until it answers, or the steps run out. Default: `5`. */
  MAX_STEPS: Type.Integer({ default: 5 }),
  /** The calls repairing an object not matching its schema, sent the validation errors. Default: `1`. */
  REPAIR_ATTEMPTS: Type.Integer({ default: 1 }),
  /** Log the prompts and the responses at the debug level. Default: `false`. */
  LOG_PROMPTS: Type.Boolean({ default: false }),
  /** The endpoints the health check of the AI service checks, by listing their models. Default: `[]`. */
  HEALTH_CHECK_ENDPOINTS: Type.Array(Type.String(), { default: [] }),
  /** The jobs of the `ai` queue a worker runs at once. Default: `4`. */
  QUEUE_CONCURRENCY: Type.Integer({ default: 4 }),
  /** The milliseconds the parts of a queued stream are batched for before they are published. Default: `50`. */
  STREAM_FLUSH_INTERVAL: Type.Integer({ default: 50 })
});
