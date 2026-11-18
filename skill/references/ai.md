# AI models

The `@appweaver/ai` module calls AI models (LLMs) through `AiService`: a whole response, a stream, an object matching
a schema, a classification or embeddings, directly or through the `ai` queue, running the tools the model calls. It
holds no driver for a vendor: the `openai` driver of `@appweaver/openai` speaks the Chat Completions and Embeddings APIs
of OpenAI, which every OpenAI-compatible server implements (Ollama, LM Studio, vLLM, llama.cpp, OpenRouter, Groq,
Together, DeepSeek, Mistral, xAI, Gemini, Hugging Face, LiteLLM, ...), so one driver reaches almost every model, local
or hosted.

```sh
npm install @appweaver/ai @appweaver/openai
```

or `weaver module add ai` in a project created with `@appweaver/create` (a local Ollama in `dev`, the mock in `test`).

## Endpoints, model references and aliases

Three ideas configure the models, all in the `ai` section of `appweaver.json`:

1. **Endpoint**: a server, named by you, with its URL and API key. A **preset** fills in the driver, the base URL, the
   environment variable of the API key and the capabilities, so `{ "preset": "ollama" }` is
   `{ "driver": "openai", "baseUrl": "http://localhost:11434/v1" }`.
2. **Model reference**: `<endpoint>:<model on that server>`, split at the first `:` only, so `local:qwen3:8b` is the
   `qwen3:8b` model of the `local` endpoint. The `mock` endpoint is built in.
3. **Default model and aliases**: `defaultModel` is the model of a call naming none, and `aliases` are your own names
   for the references (any name without a `:`, as many as you want), so the code never names a vendor and every
   environment decides what `fast` or `smart` is. An alias listing several references tries them in turn while one
   fails with a rate limit, a timeout or an unavailable provider.

```jsonc
{
  "config": {
    "ai": {
      "endpoints": {
        "local": { "preset": "ollama" },
        "openrouter": { "preset": "openrouter", "apiKey": "${OPENROUTER_API_KEY}" }
      },
      "defaultModel": "openrouter:openai/gpt-4o-mini",
      "defaultEmbeddingModel": "local:nomic-embed-text",
      "aliases": {
        "fast": "openrouter:openai/gpt-4o-mini",
        "smart": ["openrouter:anthropic/claude-sonnet-4.5", "local:qwen3:14b"]
      }
    }
  },
  "environments": {
    "dev": {
      "ai": {
        "defaultModel": "local:qwen3:8b",
        "aliases": { "fast": "local:qwen3:8b", "smart": "local:qwen3:14b" }
      }
    },
    "test": {
      "ai": { "defaultModel": "mock:echo", "aliases": { "fast": "mock:echo", "smart": "mock:echo" } }
    }
  }
}
```

Every property of an endpoint is also its own variable, `AI_ENDPOINTS_<NAME>_<PROPERTY>`
(`AI_ENDPOINTS_OPENROUTER_API_KEY`), and an endpoint without an `apiKey` reads the variable of its preset
(`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, ...). The endpoint names are camelCase, `openRouter` is
`AI_ENDPOINTS_OPEN_ROUTER_API_KEY`. `weaver config print` hides the API keys.

| Preset        | Base URL                                                  | API key variable     |
|---------------|-----------------------------------------------------------|----------------------|
| `openai`      | `https://api.openai.com/v1`                               | `OPENAI_API_KEY`     |
| `openrouter`  | `https://openrouter.ai/api/v1`                            | `OPENROUTER_API_KEY` |
| `ollama`      | `http://localhost:11434/v1`                               | `OLLAMA_API_KEY`     |
| `lmstudio`    | `http://localhost:1234/v1`                                | -                    |
| `vllm`        | `http://localhost:8000/v1`                                | `VLLM_API_KEY`       |
| `llamacpp`    | `http://localhost:8080/v1`                                | -                    |
| `litellm`     | `http://localhost:4000/v1`                                | `LITELLM_API_KEY`    |
| `groq`        | `https://api.groq.com/openai/v1`                          | `GROQ_API_KEY`       |
| `together`    | `https://api.together.xyz/v1`                             | `TOGETHER_API_KEY`   |
| `fireworks`   | `https://api.fireworks.ai/inference/v1`                   | `FIREWORKS_API_KEY`  |
| `deepseek`    | `https://api.deepseek.com/v1`                             | `DEEPSEEK_API_KEY`   |
| `mistral`     | `https://api.mistral.ai/v1`                               | `MISTRAL_API_KEY`    |
| `xai`         | `https://api.x.ai/v1`                                     | `XAI_API_KEY`        |
| `gemini`      | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY`     |
| `huggingface` | `https://router.huggingface.co/v1`                        | `HF_TOKEN`           |
| `mock`        | -                                                         | -                    |

A server without a preset sets its `baseUrl` (the `openai` driver is the default). The startup fails when the default
models or an alias name an endpoint that is not configured, and the first call of an endpoint fails when its driver
package is not installed or a hosted preset has no API key.

### Capabilities

The models of an endpoint have the `capabilities` of its preset, all of them without one: `tools`, `json`,
`json-schema`, `images`, `files`, `reasoning` and `embeddings`. A call needing one the model lacks fails before it is
sent, with `AI_CAPABILITY_UNSUPPORTED` naming it, so a PDF is never silently dropped. The local presets have no `files`,
`deepseek` has no `json-schema`, `images` nor `embeddings`. Set `capabilities` on an endpoint to correct them, and ask
with `ai.supports(model, 'images')`.

## AiService

```ts
import { AiService } from '@appweaver/ai';
import { inject } from '@appweaver/core';

const ai = inject(AiService);
```

| Method                                 | Returns                 | Description                                                                                       |
|----------------------------------------|-------------------------|---------------------------------------------------------------------------------------------------|
| `generate(prompt)`                     | `Promise<AiResult>`     | Calls the model and returns its whole response, after running the tools it calls.                |
| `stream(prompt)`                       | `AiStream`              | Streams the response: an async iterable of the text deltas, `.parts()`, `.text()`, `.result`.    |
| `generateObject({ ...prompt, schema })`| `Promise<AiObjectResult>` | An object matching a TypeBox schema, repaired up to `repairAttempts` times.                     |
| `streamObject({ ...prompt, schema })`  | `AiObjectStream`        | Streams the partial objects, `.object` once it ends.                                             |
| `classify(input, labels, prompt?)`     | `Promise<label>`        | One of the labels.                                                                                |
| `embed(texts, options?)`               | `Promise<AiEmbedResult>`| A vector per text, with `defaultEmbeddingModel`.                                                 |
| `supports(model, capability)`          | `Promise<boolean>`      | Whether a model has a capability.                                                                |
| `enqueue(prompt, jobOptions?)`         | `Promise<jobId>`        | Adds the call to the `ai` queue, run by a worker of any instance.                                |
| `generateQueued(prompt, jobOptions?)`  | `Promise<AiResult>`     | Runs the call through the queue and waits for its result, on whichever instance it runs.         |
| `streamQueued(prompt, options?)`       | `AiStream`              | Runs the call through the queue and streams it from the worker, through the `PubSub`.            |

### The prompt

```ts
const { text, usage, messages } = await ai.generate({
  model: 'fast',                         // an alias or a reference, default: ai.defaultModel
  system: 'You summarize support tickets in one sentence.',
  prompt: ticket.body,                   // the user message, after `messages`
  messages: history,                     // the conversation so far
  maxTokens: 200,
  temperature: 0.2,
  reasoning: 'low',                      // the effort of a reasoning model
  providerOptions: { provider: { sort: 'price' } }, // sent as they are (OpenRouter routing)
  signal,                                // aborts the call
  timeout: 30_000
});
```

`system` and `prompt` also take a template of the template engine, `{ template, data, locale }`, the `.md` format by
default (`prompts/summarize` renders `templates/prompts/summarize.md.hbs`). `prompt` takes the parts of a message too,
an image or a file (a PDF) by URL or base64 data:

```ts
await ai.generate({
  model: 'vision',
  system: { template: 'prompts/describe', data: { locale } },
  prompt: [
    { type: 'text', text: 'What is on the photo?' },
    { type: 'image', data: photo.toString('base64'), mimeType: 'image/jpeg' }
  ]
});
```

The result has the `text`, the `toolCalls` left to the caller, the `finishReason` (`stop`, `length`, `tool-calls`,
`content-filter`, `other`), the `reasoning` when the endpoint returns it, the `usage` of every step summed, the `model`
reference that answered, its `steps`, and the `messages` of the conversation with the response, to continue it.

### Streaming

```ts
const stream = ai.stream({ model: 'fast', prompt: question, signal });
for await (const text of stream) {
  process.stdout.write(text);
}
const { usage, finishReason } = await stream.result;
```

A stream is read once: iterate it (the text deltas), its `parts()` (the `text-delta`, `reasoning-delta`, `tool-call`,
`tool-result` and `finish` parts), or its `text()`; awaiting only its `result` reads it in the background. `abort()`
aborts the model call and its tools, and a reader stopping early ends the request. The models of an alias are tried in
turn only while nothing was streamed.

A stream is an async iterable of text, so a streaming realtime action returns it as it is, and `pipeAiStream` writes it
into a stream of `createStream` for every subscriber of a key, aborting the call once the stream is cancelled:

```ts
createRealtimeAction({
  name: 'assistant.ask',
  payload: Type.Object({ question: Type.String() }),
  stream: { codec: 'text' },
  handler: ({ question }, { signal }) => inject(AiService).stream({ model: 'fast', prompt: question, signal })
});

await pipeAiStream(ai.stream({ prompt: question }), roomAnswer.open(String(roomId)));
```

Over plain HTTP, `aiEventStream(stream)` is the body of a Server-Sent Events response (an event per part, an `error`
event with the code of a failure, the call aborted when the client leaves), and `toServerSentEvents` and `toNdjson` the
encoded parts:

```ts
reply.header('content-type', 'text/event-stream');
return reply.send(aiEventStream(ai.stream({ prompt: request.body.question })));
```

### Objects and classification

```ts
const Ticket = Type.Object({
  category: Type.Union([Type.Literal('bug'), Type.Literal('billing'), Type.Literal('question')]),
  urgency: Type.Integer({ minimum: 1, maximum: 5 }),
  summary: Type.String()
});

const { object } = await ai.generateObject({ model: 'fast', prompt: ticket.body, schema: Ticket });
const label = await ai.classify(ticket.body, ['bug', 'billing', 'question']);
```

An endpoint with `json-schema` is asked in its JSON schema mode, one with `json` in its JSON mode with the schema in the
system prompt, any other one by the system prompt alone. The JSON is read from the whole text or its first object (a
Markdown code block too), the defaults of the schema filled in, and an object not matching the schema is sent back with
its errors for the model to repair, up to `repairAttempts` (`ai.repairAttempts`) times, before `AI_OUTPUT_INVALID`.
`streamObject` yields the object parsed so far while it streams (`parsePartialJson`) and checks it once it ends,
without a repair.

### Tools

```ts
export const getOrder = createAiTool({
  name: 'getOrder',
  description: 'The status of an order of the current user',
  parameters: Type.Object({ orderId: Type.Integer() }),
  execute: ({ orderId }) => inject(OrderService).findOne({ id: orderId }) // runs as the user of the call
});

const { text, steps } = await ai.generate({ prompt: 'Where is my order 42?', tools: [getOrder], maxSteps: 3 });
```

The model is called again with the results of the tools it called until it answers or `maxSteps` (`ai.maxSteps`) model
calls ran. The arguments are validated against `parameters` (and their defaults filled in) before `execute` runs; a
failed validation, a thrown error or an unknown tool is sent back as the result of a failed call (`isError`), so the
model can recover. A tool without `execute` ends the call, returning the `toolCalls` for the caller, i.e. to ask the
user for a confirmation. `createAiTool` registers the tool under its name, so a prompt names it (`tools: ['getOrder']`),
which a queued prompt must do; a tool given to a prompt directly needs no registration.

### Embeddings

```ts
const { embeddings } = await ai.embed(documents.map((doc) => doc.text), { model: 'local:nomic-embed-text' });
const [question] = (await ai.embed(query)).embeddings;
const best = rankBySimilarity(question, documents, (doc) => doc.embedding, 3);
```

`cosineSimilarity(a, b)` compares two vectors, `rankBySimilarity` ranks items by their vectors.

### Queued calls

The `ai` queue runs the calls with the retries of the queue, `ai.queueConcurrency` at once per worker, on any instance
(BullMQ with `@appweaver/bullmq`):

```ts
await ai.enqueue({ model: 'smart', prompt: { template: 'prompts/report', data }, tools: ['saveReport'] });
const result = await ai.generateQueued({ prompt: 'Summarize ...' }, { priority: 1 });
for await (const text of ai.streamQueued({ prompt: 'Write ...' }, { signal })) { ... }
```

A queued prompt is a JSON value, so it names its tools. `generateQueued` receives the result through the `PubSub`
(`queue:ai:results`) from whichever instance ran the job, like `sendEmailAndWait` and `sendSmsAndWait`. `streamQueued`
relays the parts of the worker through the `PubSub` (`ai:stream:<id>`) in batches of `ai.streamFlushInterval`
milliseconds; its job is attempted once, since a stream cannot restart, and aborting it aborts the call of the worker.

## Errors

| Code                         | Status | Raised when                                                                                  |
|------------------------------|--------|----------------------------------------------------------------------------------------------|
| `AI_MODEL_UNKNOWN`           | 500    | No model given and no default, an unknown alias or endpoint, an invalid reference           |
| `AI_REQUEST_INVALID`         | 400    | A prompt without messages, an unknown tool name, a queued prompt with functions, one label  |
| `AI_CAPABILITY_UNSUPPORTED`  | 400    | The model lacks a capability the call needs (`details.capability`)                          |
| `AI_REQUEST_FAILED`          | 502    | The endpoint rejected the request                                                            |
| `AI_AUTH_FAILED`             | 502    | The endpoint rejected the API key (401, 403)                                                 |
| `AI_RATE_LIMITED`            | 429    | The endpoint rate limited the request (`details.retryAfter` in seconds when given)          |
| `AI_TIMEOUT`                 | 504    | The request timed out                                                                        |
| `AI_PROVIDER_UNAVAILABLE`    | 503    | The endpoint is unreachable or failed with a server error                                    |
| `AI_CONTEXT_LENGTH_EXCEEDED` | 422    | The messages exceed the context of the model                                                 |
| `AI_OUTPUT_INVALID`          | 502    | The object of the model does not match the schema after the repairs (`details.errors`)      |

The provider errors carry `details.model`, `details.endpoint`, `details.status` and `details.providerCode`. The SDK
retries a rate limit, a timeout and a server error `maxRetries` times before; the models of an alias are tried in turn
on `AI_RATE_LIMITED`, `AI_TIMEOUT` and `AI_PROVIDER_UNAVAILABLE`. An aborted call throws the reason of its signal.

## Development and tests without a model

- **Local models**: `ollama serve` and `ollama pull qwen3:0.6b` (or a bigger `qwen3:8b` for the tools), and a `dev`
  environment whose aliases name the `local` endpoint. Nothing is spent on tokens.
- **The `mock` endpoint**: its `echo` model (any model name) answers with the last user message, its `tools` model calls
  every tool once before answering with their results, a JSON schema request is answered with the default value of the
  schema, and its embeddings are derived from the texts. `mockAiResponse((request) => 'Paris')` scripts its answers in a
  test (a text or a part of the response, i.e. `{ toolCalls }`), `mockAiResponse(undefined)` removes them.
- **Drivers**: `registerAiDriver(name, Class)` registers a driver class without a module, i.e. a scripted stub, and a
  driver package runs `testAiDriverContract` of `@appweaver/testing` against a mocked server or a local model.

## Writing a driver

A driver extends `AiDriver` of `@appweaver/ai` (`generate`, `stream`, `checkHealth`, and `embed` when it embeds) and is
created once per endpoint using it, with the endpoint completed by its preset (`this.endpoint`). A module provides it as
a provider of the `AiDriver` contract named by its driver name, which the endpoints select with `driver`:

```ts
export default defineModule({
  name: '@acme/appweaver-anthropic',
  requires: ['@appweaver/ai'],
  providers: [{ contract: AiDriver, name: 'anthropic', load: () => import('./anthropic-driver') }]
});
```

It throws `AiError` with the codes above, the reason of an aborted signal as it is. Every enabled driver is usable at
once, through the endpoints selecting it.

## Health and telemetry

The `ai` health check lists the models of the endpoints of `ai.healthCheckEndpoints` (none by default). Every model call
is a `chat <model>` or `embeddings <model>` client span with the attributes of the OpenTelemetry semantic conventions
of generative AI (`gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`,
`gen_ai.response.finish_reasons`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `server.address`) and
`appweaver.ai.endpoint`, every tool call an `execute_tool <name>` span, and the `gen_ai.client.token.usage` and
`gen_ai.client.operation.duration` metrics are recorded, switched by `telemetry.instrumentations.ai`. The prompts and
the responses are logged at the `debug` level only with `ai.logPrompts`.
