<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for quick scaffolding, extending, and shipping backends with any agent.
</p>

<p align="center">
<a href="https://www.npmjs.com/@appweaver/core" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/core.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/master/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/@appweaver/core" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/core.svg" alt="NPM Downloads" /></a>
<a href="https://www.npmjs.com/@appweaver/core" target="_blank"><img src="https://img.shields.io/badge/build-passing-brightgreen.svg" alt="Build Status" /></a>

</p>

## Description

Appweaver is a batteries-included framework built on top of [Fastify](https://fastify.dev) and
[Prisma](https://prisma.io), designed from the ground up to be developed with AI agents. Instead of writing backend
boilerplate from scratch, you describe resources using concise factory functions and let the framework handle routing,
validation, database, auth, migrations, so you can focus on business logic instead of boilerplate.

### Built for agents

- **80% fewer tokens** → Appweaver's conventions and factory API eliminate the boilerplate that dominates most backend
  codebases. Your agent reads and writes only the code that matters, not hundreds of lines of scaffolding.
- **Zero-code configuration** → every framework behavior like HTTP server, database, auth, queues, mailer, cache,
  storage is controlled through `appweaver.json` config files or environment variables. No code changes are needed to
  reconfigure the app for a different environment.
- **Agent-first conventions** → a consistent, predictable project structure means agents always know where to find and
  place code: models, services, routes, and policies each live in their own file under `src/resources/<name>/`.
- **Built-in skill files** → every scaffolded project ships with agent-readable skill files that give your agent harness
  a complete map of the framework's API, conventions, and CLI, which means no hallucination, and no trial-and-error.
- **Works with any agent harness** → Claude Code, Cursor, Codex, Copilot Workspace, or any coding assistant that can
  read project files. Point your agent at the skill files, and it has everything it needs to quickly build applications.

## License

Appweaver is [MIT licensed](LICENSE).
