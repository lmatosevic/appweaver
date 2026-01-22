import {
  DestinationStream,
  LevelWithSilent,
  pino,
  destination,
  multistream,
  stdTimeFunctions
} from 'pino';
import pretty from 'pino-pretty';
import { createStream } from 'rotating-file-stream';
import { LogLevel } from '../enums';
import { config } from '../config';

const logLevel: LevelWithSilent = config.LOG_LEVEL;

const logName = config.APP_NAME
  ? config.APP_NAME.toLowerCase().replace(/\s+/g, '_')
  : 'app';

const streams: DestinationStream[] = [];

if (config.LOG_PRETTY) {
  streams.push(
    pretty({
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l Z',
      ignore: 'pid,hostname'
    })
  );
} else {
  streams.push(destination(1));
}

if (config.LOG_PATH && logLevel !== 'silent') {
  if (config.LOG_ROTATE) {
    streams.push(
      createStream(`${logName}.log`, {
        path: config.LOG_PATH,
        interval: config.LOG_ROTATE_INTERVAL as `${number}M`,
        size: config.LOG_ROTATE_SIZE as `${number}M`,
        maxSize: config.LOG_ROTATE_MAX_SIZE as `${number}M`,
        maxFiles: config.LOG_ROTATE_MAX_FILES,
        compress: config.LOG_ROTATE_COMPRESS ? 'gzip' : false
      })
    );
  } else {
    streams.push(destination(`${config.LOG_PATH}/${logName}.log`));
  }
}

const stream = multistream(
  streams.map((stream) => ({ level: logLevel, stream }))
);

const commonConfig = {
  level: logLevel,
  timestamp: stdTimeFunctions.isoTime
};

const loggerConfig =
  logLevel !== LogLevel.Silent ? { ...commonConfig, stream } : false;

const logger = pino(commonConfig, stream);

export { loggerConfig, logger };
