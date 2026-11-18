<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The OpenAI-compatible AI driver of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/openai" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/openai.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/openai.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/openai" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/openai.svg" alt="NPM Downloads" /></a>
<a href="https://github.com/lmatosevic/appweaver/actions/workflows/ci.yml?query=branch%3Amain" target="_blank"><img src="https://img.shields.io/github/actions/workflow/status/lmatosevic/appweaver/ci.yml?branch=main&label=CI" alt="CI Status" /></a>
<a href="https://codecov.io/gh/lmatosevic/appweaver" target="_blank"><img src="https://codecov.io/gh/lmatosevic/appweaver/graph/badge.svg" alt="Test Coverage" /></a>
<a href="https://nodejs.org" target="_blank"><img src="https://img.shields.io/node/v/@appweaver/openai.svg" alt="Node Version" /></a>
</p>

## Description

`@appweaver/openai` is the `openai` AI driver of [Appweaver](https://github.com/lmatosevic/appweaver), a module enabled
by installing it along with `@appweaver/ai`. It speaks the Chat Completions and Embeddings APIs of OpenAI with the
official `openai` SDK, which every OpenAI-compatible server implements, so one driver reaches OpenAI, OpenRouter,
Ollama, LM Studio, vLLM, llama.cpp, LiteLLM, Groq, Together, Fireworks, DeepSeek, Mistral, xAI, Gemini and Hugging Face,
each an endpoint of the `ai` config selecting its preset, or any other server by its `baseUrl`.

## Installation

```sh
npm install @appweaver/ai @appweaver/openai
```

or `weaver module add ai` in a project created with `@appweaver/create`.

```json
{
  "config": {
    "ai": {
      "endpoints": {
        "local": { "preset": "ollama" },
        "openrouter": {
          "preset": "openrouter",
          "apiKey": "${OPENROUTER_API_KEY}"
        }
      }
    }
  }
}
```

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [AI reference](https://github.com/lmatosevic/appweaver/blob/main/skill/references/ai.md) – the endpoints, the presets, `AiService`, the tools and the drivers
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
