import { logger } from '@appweaver/common';
import { {{CONFIG_NAME}} } from './config';

// Runs at startup: scheduled jobs, queue workers, event listeners
logger.debug(`Module {{PACKAGE_NAME}} loaded with ${ {{CONFIG_NAME}}.EXAMPLE }`);
