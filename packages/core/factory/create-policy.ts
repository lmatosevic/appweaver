import path from 'node:path';
import { capitalize, logger, ResourcePolicyConfig } from '@appweaver/common';
import { define } from '../context';
import {
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_TYPE
} from '../constants';

export function createPolicy(
  config: ResourcePolicyConfig
): ResourcePolicyConfig {
  config[RESOURCE_NAME] = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );
  config[RESOURCE_TYPE] = RESOURCE_POLICY_TYPE;

  logger.debug({ modelName: config.modelName }, 'Created resource policy');

  define(config);

  return config;
}
