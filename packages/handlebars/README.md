<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The Handlebars driver of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/handlebars" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/handlebars.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/handlebars.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/handlebars" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/handlebars.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/handlebars` is the Handlebars template engine of [Appweaver](https://github.com/lmatosevic/appweaver), a module enabled by
installing it, which provides the `handlebars` `TemplateEngine` provider. With `auto`, the default of the `template.provider` config key,
it is selected whenever the module is installed.

## Installation

```sh
npm install @appweaver/handlebars
```

or `weaver module add templates` in a project created with `create-weaver-app`.

It renders the templates of `template.path`, with the translations of the locale service.

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
