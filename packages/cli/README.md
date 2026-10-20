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
starting, code generation, migrations, seeding, one-shot tasks, OpenAPI export, test database setup, configuration
checks, modules, and package updates. It runs
under Bun automatically when the project is configured for the Bun runtime.

## Installation

```sh
npm install -D @appweaver/cli
```

The CLI needs only `@appweaver/core`. `weaver generate`, `weaver seed` and `weaver test setup` use the
`@appweaver/data` package of the project, `weaver openapi` its `@appweaver/web`, and they exit naming the package when
it is missing.

## Usage

```sh
weaver build                        # compile the TypeScript project
weaver start --watch                # start in watch mode, restarting on changes
weaver generate                     # generate types and the Prisma schema from the models
weaver migration new <name>         # create a database migration
weaver migrate                      # apply the pending migrations
weaver seed --build-project         # build the project, then run the seeders
weaver openapi --format yaml        # export the OpenAPI specification
weaver run src/tasks/report.ts      # run the default export of a file with the application, then exit
weaver test setup                   # create the temporary test database (NODE_ENV=test)
weaver config schema                # write the JSON Schema of appweaver.json from the enabled modules
weaver config print                 # print every config value with its source, the secrets hidden
weaver config check                 # validate the config, i.e. NODE_ENV=prod in CI (exit 1 on an error)
weaver module add redis docker      # add modules to the project, from the scaffold templates
weaver module add appweaver-gcs     # install a module package without its scripts, print its providers
weaver module new audit-log         # create the local module src/modules/audit-log/
weaver module remove docker         # remove a module, deleting its files
weaver upgrade --dry-run            # list the package upgrades without installing them
```

Long flags are kebab-case, and the flags turning a default off are `--no-*` negations (`--no-skill`,
`--no-registry`, `--no-prune`). Run `weaver <command> --help` for the options of a command, or see the
[CLI reference](https://github.com/lmatosevic/appweaver/blob/main/skill/references/cli.md).

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
