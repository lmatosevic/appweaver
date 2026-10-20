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
import { appConfig, logConfig } from '../config/app-config';

const level = process.env.WEAVER_CLI ? LogLevel.Silent : logConfig.LEVEL;

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
      ignore: 'pid,hostname',
      sync
    })
  );
} else {
  streams.push(destination({ dest: 1, sync }));
}

if (logConfig.PATH && level !== LogLevel.Silent) {
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

const stream = multistream(streams.map((stream) => ({ level, stream })));

const commonConfig = {
  level,
  timestamp: stdTimeFunctions.isoTime
};

const loggerConfig =
  level !== LogLevel.Silent ? { ...commonConfig, stream } : false;

const logger = pino(commonConfig, stream);

export { logger, loggerConfig };
