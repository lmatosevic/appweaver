# Appweaver - Client

![npm](https://img.shields.io/npm/v/@appweaver/client)
![NPM License](https://img.shields.io/npm/l/@appweaver/client)
![npm](https://img.shields.io/npm/dw/@appweaver/client)
![npm](https://img.shields.io/badge/build-passing-brightgreen)

> The backend framework for AI-assisted development. Scaffold, extend, and ship APIs with any agent.

Appweaver is a batteries-included framework built on top of **Fastify** and **Prisma**, designed from the ground up to
be developed with AI agents. Instead of writing backend boilerplate from scratch, you describe resources using concise
factory functions and let the framework handle routing, validation, database, auth, migrations, so you can focus
on business logic instead of boilerplate.

### Why Appweaver for agentic development?

- **80% fewer tokens** → Appweaver's conventions and factory API eliminate the boilerplate that dominates most backend
  codebases. Your agent reads and writes only the code that matters, not hundreds of lines of scaffolding.
- **Zero-code configuration** → every framework behavior like server, database, auth, queues, mailer, storage is
  controlled through `appweaver.json` config files or environment variables. No code changes are needed to reconfigure
  the app for a different environment.
- **Agent-first conventions** → a consistent, predictable project structure means agents always know where to find and
  place code: models, services, routes, and policies each live in their own file under `src/resources/<name>/`.
- **Built-in skill files** → every scaffolded project ships with agent-readable skill files that give your agent harness
  a complete map of the framework's API, conventions, and CLI, which means no hallucination, and no trial-and-error.
- **Works with any agent harness** → Claude Code, Cursor, Codex, Copilot Workspace, or any coding assistant that can
  read project files. Point your agent at the skill files, and it has everything it needs.

## License

Appweaver is [MIT licensed](LICENSE).
