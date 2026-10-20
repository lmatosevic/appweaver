<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The sharp driver of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/sharp" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/sharp.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/sharp.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/sharp" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/sharp.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/sharp` is the image processor of [Appweaver](https://github.com/lmatosevic/appweaver), a module enabled by
installing it, which provides the `sharp` `ImageProcessor` provider. With `auto`, the default of the `image.provider` config key,
it is selected whenever the module is installed.

## Installation

```sh
npm install @appweaver/sharp
```

It resizes and compresses the uploaded images by the `image` config of their file field. Without it, the images are stored as uploaded.

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
