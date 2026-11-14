import {
  destination,
  DestinationStream,
  Logger,
  multistream,
  pino,
  stdTimeFunctions
} from 'pino';
import pretty from 'pino-pretty';
import { createStream } from 'rotating-file-stream';
import { LogLevel } from '../enums';
import { appConfig, logConfig } from '../config/app-config';
import { telemetryConfig } from '../telemetry/telemetry-config';
import { traceLogFields } from '../telemetry/telemetry';

const cli = !!process.env.WEAVER_CLI;

const level = cli ? LogLevel.Silent : logConfig.LEVEL;

const levels: Readonly<Record<string, LogLevel>> = cli ? {} : logConfig.LEVELS;

// A named logger may log while the default level is silent
const enabled = [level, ...Object.values(levels)].some(
  (value) => value !== LogLevel.Silent
);

const logName = appConfig.NAME
  ? appConfig.NAME.toLowerCase().replace(/\s+/g, '_')
  : 'app';

// A synchronous destination writes each record before the next statement
// runs and registers no exit hook to flush what it buffered
const sync = logConfig.SYNC;

const streams: DestinationStream[] = [];

if (logConfig.PRETTY) {
  streams.push(
    pretty({
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l Z',
      ignore: 'pid,hostname,module',
      messageFormat: '{if module}[{module}] {end}{msg}',
      sync
    })
  );
} else {
  streams.push(destination({ dest: 1, sync }));
}

if (logConfig.PATH && enabled) {
  if (logConfig.ROTATE) {
    streams.push(
      createStream(`${logName}.log`, {
        path: logConfig.PATH,
        interval: logConfig.ROTATE_INTERVAL as `${number}M`,
        size: logConfig.ROTATE_SIZE as `${number}M`,
        maxSize: logConfig.ROTATE_MAX_SIZE as `${number}M`,
        maxFiles: logConfig.ROTATE_MAX_FILES,
        compress: logConfig.ROTATE_COMPRESS ? 'gzip' : false
      })
    );
  } else {
    streams.push(
      destination({ dest: `${logConfig.PATH}/${logName}.log`, sync })
    );
  }
}

// Every stream takes the records of every level, filtered by the level of
// the logger writing them
const stream = multistream(
  streams.map((stream) => ({ level: LogLevel.Trace, stream }))
);

// The credentials a record may carry, replaced before it is written
const redactedKeys = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret'
];

// The trace and span ids of the active span, in every record written in it
const correlated = telemetryConfig.ENABLED && telemetryConfig.LOG_CORRELATION;

const commonConfig = {
  level,
  timestamp: stdTimeFunctions.isoTime,
  ...(correlated ? { mixin: () => traceLogFields() ?? {} } : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      ...redactedKeys,
      ...redactedKeys.map((key) => `*.${key}`)
    ],
    censor: '[Redacted]'
  }
};

const loggerConfig = enabled ? { ...commonConfig, stream } : false;

const logger = pino(commonConfig, stream);

const loggers = new Map<string, Logger>();

/**
 * Returns the logger of a name, i.e. `database`, logging at its level of `LOG_LEVELS` (`log.levels.database`),
 * otherwise at `LOG_LEVEL`. Its records carry the name as their `module` field. A name is camelCase, and the same
 * name returns the same logger.
 *
 * @example
 * const log = createLogger('billing');
 * log.debug({ invoiceId }, 'Invoice sent');
 *
 * @param {string} name - The name of the logger, i.e. the short name of the module logging with it.
 * @return {Logger} The logger of the name.
 */
function createLogger(name: string): Logger {
  let named = loggers.get(name);
  if (!named) {
    named = logger.child({ module: name }, { level: levels[name] ?? level });
    loggers.set(name, named);
  }
  return named;
}

/**
 * Returns the names of `LOG_LEVELS` no logger was created for, i.e. a misspelled name or a disabled module.
 *
 * @return {string[]} The names without a logger.
 */
function unusedLogLevels(): string[] {
  return Object.keys(levels).filter((name) => !loggers.has(name));
}

/**
 * Adds a destination every logger writes its records to, as JSON lines, besides the console and the log file, i.e.
 * the OpenTelemetry log export of `@appweaver/opentelemetry`. A record reaches it only when its logger writes it, so
 * the level of the destination never lowers `LOG_LEVEL`.
 *
 * @param {DestinationStream} destination - The destination, written one JSON record at a time.
 * @param {LogLevel} [minLevel=LogLevel.Trace] - The lowest level of the records it receives.
 * @return {Function} Removes the destination.
 */
function addLogDestination(
  destination: DestinationStream,
  minLevel: LogLevel = LogLevel.Trace
): () => void {
  let active = true;
  stream.add({
    level: minLevel,
    stream: {
      write: (record: string) => {
        if (active) {
          destination.write(record);
        }
      }
    }
  });
  return () => {
    active = false;
  };
}

export {
  logger,
  loggerConfig,
  createLogger,
  unusedLogLevels,
  addLogDestination
};
