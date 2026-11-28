import type { Config } from 'prettier';

/** The Prettier config of an Appweaver project, `"prettier": "@appweaver/tooling/prettier"` in its `package.json`. */
const config: Config = {
  endOfLine: 'lf',
  singleQuote: true,
  trailingComma: 'none',
  tabWidth: 2,
  printWidth: 80
};

export = config;
