<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The AI module of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/ai" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/ai.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/ai.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/ai" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/ai.svg" alt="NPM Downloads" /></a>
<a href="https://github.com/lmatosevic/appweaver/actions/workflows/ci.yml?query=branch%3Amain" target="_blank"><img src="https://img.shields.io/github/actions/workflow/status/lmatosevic/appweaver/ci.yml?branch=main&label=CI" alt="CI Status" /></a>
<a href="https://codecov.io/gh/lmatosevic/appweaver" target="_blank"><img src="https://codecov.io/gh/lmatosevic/appweaver/graph/badge.svg" alt="Test Coverage" /></a>
<a href="https://nodejs.org" target="_blank"><img src="https://img.shields.io/node/v/@appweaver/ai.svg" alt="Node Version" /></a>
</p>

## Description

`@appweaver/ai` is the AI module of [Appweaver](https://github.com/lmatosevic/appweaver), enabled by installing it.
`AiService` calls the models (LLMs) of the endpoints of the `ai` config: a whole response, a stream, an object matching
a TypeBox schema, a classification or embeddings, directly or through the `ai` queue, running the tools the model calls
(`createAiTool`). The models are named by references (`local:qwen3:8b`) or by aliases (`fast`, `smart`), so every
environment picks its own: a local Ollama while developing, the built-in `mock` model in the tests, OpenRouter or OpenAI
in production. The drivers are modules of their own, every installed one usable at once: `@appweaver/openai` reaches
OpenAI and every OpenAI-compatible server.

## Installation

```sh
npm install @appweaver/ai @appweaver/openai
```

or `weaver module add ai` in a project created with `@appweaver/create`.

```json
{
  "config": {
    "ai": {
      "endpoints": { "local": { "preset": "ollama" } },
      "defaultModel": "local:qwen3:8b",
      "aliases": { "fast": "local:qwen3:8b" }
    }
  }
}
```

```ts
const ai = inject(AiService);
const { text } = await ai.generate({ model: 'fast', prompt: 'Summarize: ...' });
for await (const delta of ai.stream({ prompt: question }))
  process.stdout.write(delta);
```

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [AI reference](https://github.com/lmatosevic/appweaver/blob/main/skill/references/ai.md) – the endpoints, the presets, `AiService`, the tools and the drivers
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
