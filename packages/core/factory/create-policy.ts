import path from 'node:path';
import {
  capitalize,
  logger,
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_TYPE,
  ResourcePolicyConfig
} from '@appweaver/common';
import { define } from '../context';

export function createPolicy<T = any>(
  config: ResourcePolicyConfig<T>,
  override: boolean = false
): ResourcePolicyConfig<T> {
  config[RESOURCE_NAME] = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );
  config[RESOURCE_TYPE] = RESOURCE_POLICY_TYPE;

  logger.debug({ modelName: config.modelName }, 'Created resource policy');

  define(config, undefined, override ? 'override' : undefined);

  return config;
}
