import {
  destination,
  DestinationStream,
  multistream,
  pino,
  stdTimeFunctions
} from 'pino';
import pretty from 'pino-pretty';
import { createStream } from 'rotating-file-stream';
import { LogLevel } from '../enums';
import { config, files } from '../config';

const level = config.LOG_LEVEL;

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

if (config.LOG_PATH && level !== LogLevel.Silent) {
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

const stream = multistream(streams.map((stream) => ({ level, stream })));

const commonConfig = {
  level,
  timestamp: stdTimeFunctions.isoTime
};

const loggerConfig =
  level !== LogLevel.Silent ? { ...commonConfig, stream } : false;

const logger = pino(commonConfig, stream);

logger.debug({ files }, 'Configuration loaded');

export { loggerConfig, logger };
