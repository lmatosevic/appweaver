import { Type } from '@sinclair/typebox';
import { defineConfig, readRawConfig } from './define-config';
import { loadPackageJson } from './config-loader';
import { Environment, LogLevel, Runtime } from '../enums';
import { resolveEnvironment } from '../utils';

export const appConfig = defineConfig(
  'app',
  {
    /** Application environment. Values: `test`, `local`, `dev`, `staging`, `qa`, `prod`. Mapped from `NODE_ENV`, where `development` resolves to `dev` and `production` to `prod`. Default: `'prod'`. */
    ENV: Type.Union([Type.Enum(Environment), Type.String()], {
      default: Environment.Production,
      mapFrom: 'NODE_ENV'
    }),
    /** Application name. Default: `'Appweaver'`. */
    NAME: Type.String({ default: 'Appweaver' }),
    /** Application version. Mapped from `npm_package_version`. Default: `'unknown'`. */
    VERSION: Type.String({
      default: 'unknown',
      mapFrom: 'npm_package_version'
    }),
    /** Application description. */
    DESCRIPTION: Type.Optional(Type.String()),
    /** Application hostname URL. Defaults to `http://localhost:{SERVER_PORT}` if not set. */
    HOSTNAME: Type.String({ default: '' }),
    /** Base of the type URIs of the application, i.e. of the error responses (`urn:appweaver:error:resource-not-found`). A
     * URL base, i.e. `https://docs.example.com/types`, is joined with slashes instead. Default: `'urn:appweaver'`. */
    TYPE_BASE: Type.String({ default: 'urn:appweaver' }),
    /** JavaScript runtime. Auto-detected as `bun` if Bun is present, otherwise `node`. */
    RUNTIME: Type.Enum(Runtime, {
      default:
        typeof globalThis['Bun'] !== 'undefined' ? Runtime.Bun : Runtime.Node
    }),
    /** Path to compiled build artifacts. Default: `'./dist'`. */
    BUILD_PATH: Type.String({ default: './dist' }),
    /** Path to the application source code. Default: `'./src'`. */
    SOURCE_PATH: Type.String({ default: './src' }),
    /** Glob pattern for scanning application files. Default: `'<srcPath>/"*"/index.ts'`. */
    SCAN_FILES_PATTERN: Type.String({ default: '<srcPath>/*/index.ts' }),
    /** Path to the application entry point file. Default: `'<srcPath>/main.ts'`. */
    MAIN_FILE_PATH: Type.String({ default: '<srcPath>/main.ts' }),
    /** Glob pattern of the manifests of the local modules, empty to find none. Default:
     * `'<srcPath>/modules/"*"/module.ts'`. */
    MODULES_PATTERN: Type.String({ default: '<srcPath>/modules/*/module.ts' }),
    /** Paths of the module manifests to enable besides the package and local modules, relative to the project root,
     * i.e. the built `../shared/dist/module.js`. Default: `[]`. */
    MODULES: Type.Array(Type.String(), { default: [] }),
    /** Names of the modules to leave disabled, i.e. `@appweaver/web` for an application without a server. Default:
     * `[]`. */
    MODULES_DISABLED: Type.Array(Type.String(), { default: [] })
  },
  {
    transform: (values) => ({
      ...values,
      ENV: resolveEnvironment(values.ENV),
      VERSION: values.VERSION === 'unknown' ? packageVersion() : values.VERSION,
      HOSTNAME: values.HOSTNAME || defaultHostname(),
      SCAN_FILES_PATTERN: values.SCAN_FILES_PATTERN.replace(
        '<srcPath>',
        values.SOURCE_PATH
      ),
      MAIN_FILE_PATH: values.MAIN_FILE_PATH.replace(
        '<srcPath>',
        values.SOURCE_PATH
      ),
      MODULES_PATTERN: values.MODULES_PATTERN.replace(
        '<srcPath>',
        values.SOURCE_PATH
      )
    })
  }
);

export const logConfig = defineConfig('log', {
  /** Minimum log level. Values: `silent`, `trace`, `debug`, `info`, `warn`, `error`, `fatal`. Default: `'info'`. */
  LEVEL: Type.Enum(LogLevel, { default: LogLevel.Info }),
  /** Path to a log file. If unset, logs to console only. */
  PATH: Type.Optional(Type.String()),
  /** Enable log file rotation. Default: `true`. */
  ROTATE: Type.Boolean({ default: true }),
  /** Maximum size per log file before rotation. Default: `'100M'`. */
  ROTATE_SIZE: Type.String({ default: '100M' }),
  /** Maximum total size of all log files. Default: `'5G'`. */
  ROTATE_MAX_SIZE: Type.String({ default: '5G' }),
  /** Maximum number of rotated log files to keep. Default: `1000`. */
  ROTATE_MAX_FILES: Type.Integer({ default: 1000 }),
  /** Rotation interval (e.g. `'1d'` for daily). Default: `'1d'`. */
  ROTATE_INTERVAL: Type.String({ default: '1d' }),
  /** Compress rotated log files with gzip. Default: `true`. */
  ROTATE_COMPRESS: Type.Boolean({ default: true }),
  /** Enable pretty-printed JSON logs. Default: `false`. */
  PRETTY: Type.Boolean({ default: false }),
  /** Write every log record before the next statement runs, instead of
   * buffering it. Costs throughput, and keeps the output flushed and in order
   * where it must not be lost, such as tests. Default: `false`. */
  SYNC: Type.Boolean({ default: false })
});

/** The version of the local package.json, `unknown` when there is none. */
function packageVersion(): string {
  try {
    return loadPackageJson().version || 'unknown';
  } catch {
    // package.json does not exist in the project root
    return 'unknown';
  }
}

/** The URL of the server address, `localhost` for the wildcard host. */
function defaultHostname(): string {
  const host =
    (readRawConfig('SERVER_HOST') as string | undefined) ?? '0.0.0.0';
  const port = (readRawConfig('SERVER_PORT') as string | undefined) ?? '5000';
  return `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
}
