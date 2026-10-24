<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The Nodemailer driver of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/nodemailer" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/nodemailer.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/nodemailer.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/nodemailer" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/nodemailer.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/nodemailer` is the SMTP mailer of [Appweaver](https://github.com/lmatosevic/appweaver), a module enabled by
installing it, which provides the `smtp` `Mailer` provider. With `auto`, the default of the `mailer.provider` config key,
it is selected whenever the module is installed.

## Installation

```sh
npm install @appweaver/nodemailer
```

or `weaver module add mailer` in a project created with `create-weaver-app`.

The SMTP connection is configured in `mailer.smtp` (`MAILER_SMTP_HOST`, `MAILER_SMTP_PORT`, ...).

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
