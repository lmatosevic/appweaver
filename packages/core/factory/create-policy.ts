import path from 'node:path';
import { capitalize, ResourcePolicyConfig } from '@appweaver/common';
import { define } from '../context';
import {
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_TYPE
} from '../constants';

export function createPolicy(
  config: ResourcePolicyConfig
): ResourcePolicyConfig {
  const name = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );

  config[RESOURCE_NAME] = name;
  config[RESOURCE_TYPE] = RESOURCE_POLICY_TYPE;

  define(name, config);

  return config;
}
