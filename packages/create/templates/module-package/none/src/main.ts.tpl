import { createLogger } from '@appweaver/common';
import { {{CONFIG_NAME}} } from './config';

// Logs at the level of `log.levels.{{LOGGER_NAME}}`, otherwise of `log.level`
const logger = createLogger('{{LOGGER_NAME}}');

// Runs at startup: scheduled jobs, queue workers, event listeners
logger.debug(`Module {{PACKAGE_NAME}} loaded with ${ {{CONFIG_NAME}}.EXAMPLE }`);
