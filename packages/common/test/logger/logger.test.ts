import { LogLevel } from '../../enums';
import type { Config } from '../../config/config-type';

type LoggerModule = typeof import('../../logger/logger');

/** The shape `loggerConfig` takes for every level except `silent`. */
type ActiveLoggerConfig = Extract<
  LoggerModule['loggerConfig'],
  { level: unknown }
>;

/** Narrows the exported config to its enabled shape, failing if it is disabled. */
const activeConfig = (
  config: LoggerModule['loggerConfig']
): ActiveLoggerConfig => {
  expect(config).not.toBe(false);
  return config as ActiveLoggerConfig;
};

/** Minimal stand-in for a pino destination stream. */
const fakeStream = (name: string) => ({ name, write: jest.fn() });

/** The subset of the application config the logger reads, at its schema defaults. */
const defaultConfig: Partial<Config> = {
  APP_NAME: 'Appweaver',
  LOG_LEVEL: LogLevel.Info,
  LOG_PRETTY: false,
  LOG_ROTATE: true,
  LOG_ROTATE_SIZE: '100M',
  LOG_ROTATE_MAX_SIZE: '5G',
  LOG_ROTATE_MAX_FILES: 1000,
  LOG_ROTATE_INTERVAL: '1d',
  LOG_ROTATE_COMPRESS: true
};

describe('logger', () => {
  let destination: jest.Mock;
  let pretty: jest.Mock;
  let createStream: jest.Mock;

  /**
   * The logger builds its streams once, at import time, so every case re-imports
   * it against a stubbed config. Loading the real config module is deliberately
   * avoided: mapping environment variables onto the config is the responsibility
   * of `config-loader`, which is covered by its own tests, and parsing the full
   * schema on every import costs far more than the logger assertions themselves.
   *
   * The destination factories are mocked so that no file descriptor is opened,
   * while `pino` and `pino.multistream` stay real.
   */
  const loadLogger = (config: Partial<Config> = {}): LoggerModule => {
    let loaded: LoggerModule | undefined;

    jest.isolateModules(() => {
      jest.doMock('../../config', () => ({
        config: { ...defaultConfig, ...config }
      }));
      jest.doMock('pino', () => ({
        ...jest.requireActual('pino'),
        destination
      }));
      jest.doMock('pino-pretty', () => pretty);
      jest.doMock('rotating-file-stream', () => ({ createStream }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require('../../logger/logger');
    });

    return loaded as LoggerModule;
  };

  beforeEach(() => {
    delete process.env.WEAVER_CLI;

    destination = jest.fn((target) => fakeStream(`destination:${target}`));
    pretty = jest.fn(() => fakeStream('pretty'));
    createStream = jest.fn(() => fakeStream('rotating'));
  });

  afterEach(() => {
    delete process.env.WEAVER_CLI;
    jest.resetModules();
  });

  describe('log level', () => {
    test('uses the configured level', () => {
      const { logger, loggerConfig } = loadLogger({
        LOG_LEVEL: LogLevel.Debug
      });

      expect(loggerConfig).toMatchObject({ level: LogLevel.Debug });
      expect(logger.level).toBe(LogLevel.Debug);
    });

    test('defaults to the info level', () => {
      const { logger, loggerConfig } = loadLogger();

      expect(loggerConfig).toMatchObject({ level: LogLevel.Info });
      expect(logger.level).toBe(LogLevel.Info);
    });

    test('disables the logger config when the level is silent', () => {
      const { logger, loggerConfig } = loadLogger({
        LOG_LEVEL: LogLevel.Silent
      });

      expect(loggerConfig).toBe(false);
      expect(logger.level).toBe(LogLevel.Silent);
    });

    test('forces the silent level when running through the CLI', () => {
      process.env.WEAVER_CLI = 'true';

      const { logger, loggerConfig } = loadLogger({
        LOG_LEVEL: LogLevel.Debug
      });

      expect(loggerConfig).toBe(false);
      expect(logger.level).toBe(LogLevel.Silent);
    });

    test('exposes an ISO timestamp function', () => {
      const { loggerConfig } = loadLogger();

      expect(typeof activeConfig(loggerConfig).timestamp).toBe('function');
    });
  });

  describe('standard output stream', () => {
    test('writes to the standard output by default', () => {
      const { loggerConfig } = loadLogger();

      expect(destination).toHaveBeenCalledWith(1);
      expect(pretty).not.toHaveBeenCalled();
      expect(activeConfig(loggerConfig).stream.streams).toHaveLength(1);
    });

    test('uses the pretty printer when LOG_PRETTY is enabled', () => {
      loadLogger({ LOG_PRETTY: true });

      expect(pretty).toHaveBeenCalledWith({
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l Z',
        ignore: 'pid,hostname'
      });
      expect(destination).not.toHaveBeenCalled();
    });
  });

  describe('file stream', () => {
    const LOG_PATH = './logs';

    test('is not registered when LOG_PATH is unset', () => {
      loadLogger();

      expect(createStream).not.toHaveBeenCalled();
      expect(destination).toHaveBeenCalledTimes(1);
    });

    test('rotates the log file by default', () => {
      const { loggerConfig } = loadLogger({ LOG_PATH });

      expect(createStream).toHaveBeenCalledWith('appweaver.log', {
        path: LOG_PATH,
        interval: '1d',
        size: '100M',
        maxSize: '5G',
        maxFiles: 1000,
        compress: 'gzip'
      });
      expect(activeConfig(loggerConfig).stream.streams).toHaveLength(2);
    });

    test('applies the configured rotation settings', () => {
      loadLogger({
        LOG_PATH,
        LOG_ROTATE_INTERVAL: '12h',
        LOG_ROTATE_SIZE: '10M',
        LOG_ROTATE_MAX_SIZE: '1G',
        LOG_ROTATE_MAX_FILES: 20,
        LOG_ROTATE_COMPRESS: false
      });

      expect(createStream).toHaveBeenCalledWith('appweaver.log', {
        path: LOG_PATH,
        interval: '12h',
        size: '10M',
        maxSize: '1G',
        maxFiles: 20,
        compress: false
      });
    });

    test('writes to a plain file when rotation is disabled', () => {
      loadLogger({ LOG_PATH, LOG_ROTATE: false });

      expect(createStream).not.toHaveBeenCalled();
      expect(destination).toHaveBeenCalledWith(`${LOG_PATH}/appweaver.log`);
    });

    test('derives the file name from the application name', () => {
      loadLogger({ LOG_PATH, APP_NAME: 'My Sample API' });

      expect(createStream).toHaveBeenCalledWith(
        'my_sample_api.log',
        expect.objectContaining({ path: LOG_PATH })
      );
    });

    test('falls back to a generic file name without an application name', () => {
      loadLogger({ LOG_PATH, APP_NAME: '' });

      expect(createStream).toHaveBeenCalledWith(
        'app.log',
        expect.objectContaining({ path: LOG_PATH })
      );
    });

    test('is skipped entirely when the level is silent', () => {
      const { loggerConfig } = loadLogger({
        LOG_PATH,
        LOG_LEVEL: LogLevel.Silent
      });

      expect(loggerConfig).toBe(false);
      expect(createStream).not.toHaveBeenCalled();
      expect(destination).toHaveBeenCalledTimes(1);
    });
  });

  describe('logger instance', () => {
    test('writes a record to every registered stream', () => {
      const { logger } = loadLogger({
        LOG_PATH: './logs',
        LOG_LEVEL: LogLevel.Info
      });

      logger.info('hello');

      const written = [
        ...destination.mock.results,
        ...createStream.mock.results
      ].map((result) => result.value.write);

      expect(written).toHaveLength(2);
      for (const write of written) {
        expect(write).toHaveBeenCalledTimes(1);
        expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
          level: 30,
          msg: 'hello'
        });
      }
    });

    test('does not write records below the configured level', () => {
      const { logger } = loadLogger({ LOG_LEVEL: LogLevel.Error });

      logger.info('ignored');

      expect(destination.mock.results[0].value.write).not.toHaveBeenCalled();
    });
  });
});
