import { LogLevel } from '../../enums';

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

/** The flattened keys of the application config the logger reads, at their schema defaults. */
type Config = Record<string, unknown>;

const defaultConfig: Config = {
  APP_NAME: 'Appweaver',
  LOG_LEVEL: LogLevel.Info,
  LOG_LEVELS: {},
  LOG_PRETTY: false,
  LOG_ROTATE: true,
  LOG_ROTATE_SIZE: '100M',
  LOG_ROTATE_MAX_SIZE: '5G',
  LOG_ROTATE_MAX_FILES: 1000,
  LOG_ROTATE_INTERVAL: '1d',
  LOG_ROTATE_COMPRESS: true,
  LOG_SYNC: false,
  TELEMETRY_ENABLED: true,
  TELEMETRY_LOG_CORRELATION: true
};

describe('logger', () => {
  let destination: jest.Mock;
  let pretty: jest.Mock;
  let createStream: jest.Mock;
  let traceLogFields: jest.Mock;

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
  const loadLogger = (config: Config = {}): LoggerModule => {
    let loaded: LoggerModule | undefined;

    jest.isolateModules(() => {
      // The flattened keys are split into the sections the logger imports
      const values = { ...defaultConfig, ...config };
      const section = (prefix: string) =>
        Object.fromEntries(
          Object.entries(values)
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => [key.slice(prefix.length), value])
        );
      jest.doMock('../../config/app-config', () => ({
        appConfig: section('APP_'),
        logConfig: section('LOG_')
      }));
      jest.doMock('../../telemetry/telemetry-config', () => ({
        telemetryConfig: section('TELEMETRY_')
      }));
      jest.doMock('../../telemetry/telemetry', () => ({ traceLogFields }));
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
    traceLogFields = jest.fn(() => undefined);
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

      expect(destination).toHaveBeenCalledWith({ dest: 1, sync: false });
      expect(pretty).not.toHaveBeenCalled();
      expect(activeConfig(loggerConfig).stream.streams).toHaveLength(1);
    });

    test('writes synchronously when LOG_SYNC is enabled', () => {
      loadLogger({ LOG_SYNC: true });

      expect(destination).toHaveBeenCalledWith({ dest: 1, sync: true });
    });

    test('uses the pretty printer when LOG_PRETTY is enabled', () => {
      loadLogger({ LOG_PRETTY: true });

      expect(pretty).toHaveBeenCalledWith({
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l Z',
        ignore: 'pid,hostname,module',
        messageFormat: '{if module}[{module}] {end}{msg}',
        sync: false
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
      expect(destination).toHaveBeenCalledWith({
        dest: `${LOG_PATH}/appweaver.log`,
        sync: false
      });
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

    test('is registered when only a named logger is enabled', () => {
      const { loggerConfig } = loadLogger({
        LOG_PATH,
        LOG_LEVEL: LogLevel.Silent,
        LOG_LEVELS: { database: LogLevel.Trace }
      });

      expect(loggerConfig).not.toBe(false);
      expect(createStream).toHaveBeenCalled();
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

    test('redacts the credentials of a record and of its nested objects', () => {
      const { createLogger } = loadLogger();

      createLogger('security').info(
        {
          password: 'secret',
          user: { id: 1, refreshToken: 'abc' },
          req: { headers: { authorization: 'Bearer x', host: 'localhost' } }
        },
        'login'
      );

      const record = JSON.parse(
        destination.mock.results[0].value.write.mock.calls[0][0]
      );
      expect(record).toMatchObject({
        password: '[Redacted]',
        user: { id: 1, refreshToken: '[Redacted]' },
        req: { headers: { authorization: '[Redacted]', host: 'localhost' } }
      });
    });

    test('does not write records below the configured level', () => {
      const { logger } = loadLogger({ LOG_LEVEL: LogLevel.Error });

      logger.info('ignored');

      expect(destination.mock.results[0].value.write).not.toHaveBeenCalled();
    });
  });

  describe('createLogger', () => {
    const written = () =>
      destination.mock.results[0].value.write.mock.calls.map(
        ([record]: [string]) => JSON.parse(record)
      );

    test('logs at the default level without a level of its own', () => {
      const { createLogger } = loadLogger({ LOG_LEVEL: LogLevel.Warn });

      expect(createLogger('cache').level).toBe(LogLevel.Warn);
    });

    test('logs at its level of LOG_LEVELS', () => {
      const { createLogger, logger } = loadLogger({
        LOG_LEVEL: LogLevel.Info,
        LOG_LEVELS: { database: LogLevel.Trace, cache: LogLevel.Error }
      });

      expect(createLogger('database').level).toBe(LogLevel.Trace);
      expect(createLogger('cache').level).toBe(LogLevel.Error);
      expect(logger.level).toBe(LogLevel.Info);
    });

    test('writes the records below the default level of a lower named level', () => {
      const { createLogger, logger } = loadLogger({
        LOG_LEVEL: LogLevel.Silent,
        LOG_LEVELS: { database: LogLevel.Trace }
      });

      createLogger('database').trace('query');
      logger.error('ignored');

      expect(written()).toEqual([
        expect.objectContaining({ level: 10, module: 'database', msg: 'query' })
      ]);
    });

    test('disables a logger with the silent level', () => {
      const { createLogger, logger } = loadLogger({
        LOG_LEVELS: { cache: LogLevel.Silent }
      });

      createLogger('cache').error('ignored');
      logger.info('kept');

      expect(written()).toEqual([expect.objectContaining({ msg: 'kept' })]);
    });

    test('returns the same logger for the same name', () => {
      const { createLogger } = loadLogger();

      expect(createLogger('queue')).toBe(createLogger('queue'));
      expect(createLogger('queue')).not.toBe(createLogger('events'));
    });

    test('ignores LOG_LEVELS when running through the CLI', () => {
      process.env.WEAVER_CLI = 'true';

      const { createLogger, loggerConfig } = loadLogger({
        LOG_LEVELS: { database: LogLevel.Trace }
      });

      expect(loggerConfig).toBe(false);
      expect(createLogger('database').level).toBe(LogLevel.Silent);
    });
  });

  describe('unusedLogLevels', () => {
    test('returns the names of LOG_LEVELS without a logger', () => {
      const { createLogger, unusedLogLevels } = loadLogger({
        LOG_LEVELS: { database: LogLevel.Trace, databse: LogLevel.Debug }
      });

      createLogger('database');

      expect(unusedLogLevels()).toEqual(['databse']);
    });
  });

  describe('log correlation', () => {
    const written = () =>
      JSON.parse(destination.mock.results[0].value.write.mock.calls[0][0]);

    test('adds the ids of the active span to a record', () => {
      traceLogFields.mockReturnValue({
        trace_id: 'a'.repeat(32),
        span_id: 'b'.repeat(16),
        trace_flags: '01'
      });
      const { createLogger } = loadLogger();

      createLogger('billing').info('Invoice sent');

      expect(written()).toMatchObject({
        module: 'billing',
        msg: 'Invoice sent',
        trace_id: 'a'.repeat(32),
        span_id: 'b'.repeat(16),
        trace_flags: '01'
      });
    });

    test('adds nothing to a record written outside of a span', () => {
      const { logger } = loadLogger();

      logger.info('hello');

      expect(written()).not.toHaveProperty('trace_id');
    });

    test.each([
      ['telemetry disabled', { TELEMETRY_ENABLED: false }],
      ['log correlation disabled', { TELEMETRY_LOG_CORRELATION: false }]
    ])('never reads the active span with %s', (_name, config) => {
      const { logger } = loadLogger(config);

      logger.info('hello');

      expect(traceLogFields).not.toHaveBeenCalled();
    });
  });

  describe('addLogDestination', () => {
    test('writes the records of every logger to the destination, from its level', () => {
      const { logger, createLogger, addLogDestination } = loadLogger({
        LOG_LEVEL: LogLevel.Debug
      });
      const write = jest.fn();

      addLogDestination({ write }, LogLevel.Warn);
      logger.info('ignored');
      createLogger('billing').warn({ invoiceId: 7 }, 'Invoice overdue');

      expect(write).toHaveBeenCalledTimes(1);
      expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
        level: 40,
        module: 'billing',
        invoiceId: 7,
        msg: 'Invoice overdue'
      });
    });

    test('receives every level by default, until it is removed', () => {
      const { logger, addLogDestination } = loadLogger({
        LOG_LEVEL: LogLevel.Trace
      });
      const write = jest.fn();

      const remove = addLogDestination({ write });
      logger.trace('first');
      remove();
      logger.error('second');

      expect(write).toHaveBeenCalledTimes(1);
    });
  });
});
