<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The MCP server of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/mcp" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/mcp.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/mcp.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/mcp" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/mcp.svg" alt="NPM Downloads" /></a>
<a href="https://github.com/lmatosevic/appweaver/actions/workflows/ci.yml?query=branch%3Amain" target="_blank"><img src="https://img.shields.io/github/actions/workflow/status/lmatosevic/appweaver/ci.yml?branch=main&label=CI" alt="CI Status" /></a>
<a href="https://codecov.io/gh/lmatosevic/appweaver" target="_blank"><img src="https://codecov.io/gh/lmatosevic/appweaver/graph/badge.svg" alt="Test Coverage" /></a>
<a href="https://nodejs.org" target="_blank"><img src="https://img.shields.io/node/v/@appweaver/mcp.svg" alt="Node Version" /></a>
</p>

## Description

`@appweaver/mcp` is the Model Context Protocol server of [Appweaver](https://github.com/lmatosevic/appweaver), a module
enabled by installing it. AI agents call the application at `POST /api/mcp`, authenticated like the API and running
as that user, so the resource policies apply. Nothing is exposed unless declared: the resource actions of the `mcp`
key of `createRoutes`, and the custom tools of `createMcpTool`. The destructive tools need `mcp.destructiveEnabled`.

## Installation

```sh
npm install @appweaver/mcp
```

or `weaver module add mcp` in a project created with `@appweaver/create`.

```ts
createRoutes({
  modelName: 'post',
  mcp: { actions: ['find', 'query', 'create'] }
});
```

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [MCP reference](https://github.com/lmatosevic/appweaver/blob/main/skill/references/mcp.md) – the endpoint, the resource tools, the custom tools and the destructive opt-in
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
