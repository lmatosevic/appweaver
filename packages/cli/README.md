<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The <code>weaver</code> command line tool of <a href="https://appweaver.co" target="_blank">Appweaver</a>.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/cli" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/cli.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/cli.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/cli" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/cli.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/cli` provides the `weaver` binary that drives the development workflow of an Appweaver project: building,
starting, code generation, migrations, seeding, OpenAPI export, test database setup, and package updates. It runs
under Bun automatically when the project is configured for the Bun runtime.

## Installation

```sh
npm install -D @appweaver/cli
```

## Usage

```sh
weaver build                        # compile the TypeScript project
weaver start --watch                # start in watch mode, restarting on changes
weaver generate                     # generate types and the Prisma schema from the models
weaver migration new <name>         # create a database migration
weaver migrate                      # apply the pending migrations
weaver seed --build-project         # build the project, then run the seeders
weaver openapi --format yaml        # export the OpenAPI specification
weaver test setup                   # create the temporary test database (NODE_ENV=test)
weaver update --dry-run             # list the package updates without installing them
```

Long flags are kebab-case, and the flags turning a default off are `--no-*` negations (`--no-skill`,
`--no-registry`). Run `weaver <command> --help` for the options of a command, or see the
[CLI reference](https://github.com/lmatosevic/appweaver/blob/main/skill/references/cli.md).

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
