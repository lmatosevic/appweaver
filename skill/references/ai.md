# AI models

`@appweaver/ai` calls AI models through `AiService`: whole responses, streams, objects matching a schema,
classifications and embeddings, directly or through the `ai` queue, running the tools the model calls. The `openai`
driver of `@appweaver/openai` speaks the OpenAI Chat Completions and Embeddings APIs, which every OpenAI-compatible
server implements (Ollama, LM Studio, vLLM, llama.cpp, OpenRouter, Groq, DeepSeek, Mistral, Gemini, ...).

```sh
npm install @appweaver/ai @appweaver/openai   # or: weaver module add ai
```

## Configuration

- **Endpoint**: a server you name, with a `preset` filling in the driver, base URL, API key variable and capabilities.
- **Model reference**: `<endpoint>:<model>`, split at the first `:` (`local:qwen3:8b`). The `mock` endpoint is built in.
- **`defaultModel`**: the model of a call naming none.
- **`aliases`**: your own names for references (any name without `:`), so the code never names a vendor. A list is tried
  in turn on `AI_RATE_LIMITED`, `AI_TIMEOUT` and `AI_PROVIDER_UNAVAILABLE`.

```jsonc
{
  "config": {
    "ai": {
      "endpoints": {
        "local": { "preset": "ollama" },
        "openrouter": { "preset": "openrouter", "apiKey": "${OPENROUTER_API_KEY}" }
      },
      "defaultModel": "openrouter:openai/gpt-4o-mini",
      "aliases": { "fast": "openrouter:openai/gpt-4o-mini", "smart": ["openrouter:anthropic/claude-sonnet-4.5", "local:qwen3:14b"] }
    }
  },
  "environments": {
    "dev": { "ai": { "defaultModel": "local:qwen3:8b", "aliases": { "fast": "local:qwen3:8b", "smart": "local:qwen3:14b" } } },
    "test": { "ai": { "defaultModel": "mock:echo", "aliases": { "fast": "mock:echo", "smart": "mock:echo" } } }
  }
}
```

Each endpoint property is also a variable, `AI_ENDPOINTS_<NAME>_<PROPERTY>` (`AI_ENDPOINTS_OPENROUTER_API_KEY`), and an
endpoint without `apiKey` reads its preset's variable. Startup fails when a default model or alias names an unknown
endpoint.

| Preset                                    | Base URL                                 | API key variable                 |
|-------------------------------------------|------------------------------------------|----------------------------------|
| `openai`                                  | `https://api.openai.com/v1`              | `OPENAI_API_KEY`                 |
| `openrouter`                              | `https://openrouter.ai/api/v1`           | `OPENROUTER_API_KEY`             |
| `ollama`, `lmstudio`, `vllm`, `llamacpp`  | `localhost` on 11434, 1234, 8000, 8080   | `OLLAMA_API_KEY`, `VLLM_API_KEY` |
| `litellm`                                 | `http://localhost:4000/v1`               | `LITELLM_API_KEY`                |
| `groq`, `together`, `fireworks`, `deepseek`, `mistral`, `xai`, `gemini`, `huggingface` | their APIs | `<NAME>_API_KEY`, `HF_TOKEN` |
| `mock`                                    | -                                        | -                                |

Any other server sets its `baseUrl` (the `openai` driver is the default). A call needing a capability the endpoint lacks
(`tools`, `json`, `json-schema`, `images`, `files`, `reasoning`, `embeddings`) fails with `AI_CAPABILITY_UNSUPPORTED`
before it is sent; set `capabilities` on the endpoint to correct the preset.

## AiService

| Method                                  | Returns                   |
|-----------------------------------------|---------------------------|
| `generate(prompt)`                      | `Promise<AiResult>`       |
| `stream(prompt)`                        | `AiStream`                |
| `generateObject({ ...prompt, schema })` | `Promise<AiObjectResult>` |
| `streamObject({ ...prompt, schema })`   | `AiObjectStream`          |
| `classify(input, labels, prompt?)`      | `Promise<label>`          |
| `embed(texts, options?)`                | `Promise<AiEmbedResult>`  |
| `supports(model, capability)`           | `Promise<boolean>`        |
| `enqueue(prompt, jobOptions?)`          | `Promise<jobId>`          |
| `generateQueued(prompt, jobOptions?)`   | `Promise<AiResult>`       |
| `streamQueued(prompt, options?)`        | `AiStream`                |

```ts
const ai = inject(AiService);
const { text, usage, messages } = await ai.generate({
  model: 'fast',                  // an alias or a reference, default: ai.defaultModel
  system: 'Summarize in one sentence.',
  prompt: ticket.body,            // the user message, after `messages`
  messages: history,
  maxTokens: 200,
  temperature: 0.2,
  reasoning: 'low',
  providerOptions: { provider: { sort: 'price' } }, // sent as they are
  signal
});
```

`system` and `prompt` also take a template, `{ template, data, locale }` (`prompts/summarize` renders
`templates/prompts/summarize.md.hbs`), and `prompt` takes parts: `{ type: 'image', url | data, mimeType }` and
`{ type: 'file', data, mimeType }` (a PDF). The result has `text`, `toolCalls`, `finishReason`, `reasoning`, the summed
`usage`, the `model` reference that answered, its `steps` and the `messages` to continue the conversation.

### Streams

An `AiStream` is read once: iterate it (text deltas), its `parts()` (`text-delta`, `reasoning-delta`, `tool-call`,
`tool-result`, `finish`) or `text()`. `result` resolves once it ends, `abort()` aborts the call.

```ts
for await (const text of ai.stream({ prompt: question, signal })) process.stdout.write(text);

createRealtimeAction({                // a streaming action returns the stream as it is
  name: 'assistant.ask',
  payload: Type.Object({ question: Type.String() }),
  stream: { codec: 'text' },
  handler: ({ question }, { signal }) => inject(AiService).stream({ prompt: question, signal })
});
await pipeAiStream(ai.stream({ prompt }), roomAnswer.open(roomId)); // into a stream of createStream
reply.header('content-type', 'text/event-stream').send(aiEventStream(ai.stream({ prompt }))); // SSE over HTTP
```

### Objects and classification

```ts
const { object } = await ai.generateObject({ prompt: ticket.body, schema: TicketTriage });
const label = await ai.classify(ticket.body, ['bug', 'billing', 'question']);
```

The JSON schema mode is used when the endpoint has it, otherwise its JSON mode or the prompt. An object not matching
the schema is sent back with the errors up to `ai.repairAttempts` times, then fails with `AI_OUTPUT_INVALID`.
`streamObject` yields the partial objects and checks the final one without repairs.

### Tools

```ts
export const getOrder = createAiTool({
  name: 'getOrder',
  description: 'The status of an order of the current user',
  parameters: Type.Object({ orderId: Type.Integer() }),
  execute: ({ orderId }) => inject(OrderService).findOne({ id: orderId }) // runs as the user of the call
});
await ai.generate({ prompt: 'Where is my order 42?', tools: [getOrder] });
```

The model is called again with the tool results until it answers or `maxSteps` (`ai.maxSteps`) calls ran. Invalid
arguments, thrown errors and unknown tools are sent back as failed results. A tool without `execute` ends the call and
returns its `toolCalls`. Registered tools can be named (`tools: ['getOrder']`), which queued prompts must do.

### Embeddings

```ts
const { embeddings } = await ai.embed(texts); // ai.defaultEmbeddingModel
const best = rankBySimilarity(queryVector, docs, (doc) => doc.embedding, 3); // and cosineSimilarity(a, b)
```

### Queue

`enqueue` and `generateQueued` run the call on any instance's `ai` worker (`ai.queueConcurrency`), with the queue's
retries; `generateQueued` gets the result through the `PubSub`. `streamQueued` relays the worker's parts through the
`PubSub`, is attempted once, and aborting it aborts the worker's call. Queued prompts are JSON, naming their tools.

## Errors

| Code                         | Status | When                                                                    |
|------------------------------|--------|-------------------------------------------------------------------------|
| `AI_MODEL_UNKNOWN`           | 500    | No model, an unknown alias or endpoint, an invalid reference           |
| `AI_REQUEST_INVALID`         | 400    | No messages, an unknown tool name, functions in a queued prompt         |
| `AI_CAPABILITY_UNSUPPORTED`  | 400    | The model lacks a needed capability (`details.capability`)              |
| `AI_REQUEST_FAILED`          | 502    | The endpoint rejected the request                                       |
| `AI_AUTH_FAILED`             | 502    | The endpoint rejected the API key                                       |
| `AI_RATE_LIMITED`            | 429    | Rate limited (`details.retryAfter`)                                     |
| `AI_TIMEOUT`                 | 504    | The request timed out                                                   |
| `AI_PROVIDER_UNAVAILABLE`    | 503    | Unreachable, or a server error                                          |
| `AI_CONTEXT_LENGTH_EXCEEDED` | 422    | The messages exceed the model's context                                 |
| `AI_OUTPUT_INVALID`          | 502    | The object does not match the schema after the repairs                  |

The SDK retries rate limits, timeouts and server errors `maxRetries` times first. An aborted call throws its signal's
reason.

## Testing and local development

- **Local models**: `ollama pull qwen3:0.6b` (`qwen3:8b` for tools) and a `dev` environment on the `local` endpoint.
- **`mock` endpoint**: `echo` repeats the last user message, `tools` calls every tool once, a schema is answered with
  its default value, embeddings are derived from the text. `mockAiResponse((request) => 'Paris')` scripts its answers.
- **Drivers**: `registerAiDriver(name, Class)` registers a driver without a module, and a driver package runs
  `testAiDriverContract` of `@appweaver/testing`.

## Writing a driver

A driver extends `AiDriver` (`generate`, `stream`, `checkHealth`, optional `embed`), is created once per endpoint
(`this.endpoint`), throws `AiError` with the codes above, and is provided by a module:

```ts
export default defineModule({
  name: '@acme/appweaver-anthropic',
  requires: ['@appweaver/ai'],
  providers: [{ contract: AiDriver, name: 'anthropic', load: () => import('./anthropic-driver') }]
});
```

Endpoints select it with `"driver": "anthropic"`; every installed driver is usable at once.

## Health and telemetry

The `ai` health check lists the models of `ai.healthCheckEndpoints`. Every model call is a `chat <model>` or
`embeddings <model>` span with the `gen_ai.*` attributes, every tool call an `execute_tool <name>` span, with the
`gen_ai.client.token.usage` and `gen_ai.client.operation.duration` metrics (`telemetry.instrumentations.ai`). Prompts
are logged only with `ai.logPrompts`.
