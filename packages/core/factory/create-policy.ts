import path from 'node:path';
import { capitalize, ResourcePolicyConfig } from '@appweaver/common';
import { context } from '../context';
import {
  ResourceNameSymbol,
  ResourceTypePolicy,
  ResourceTypeSymbol
} from '../constants';

export function createPolicy(
  config: ResourcePolicyConfig
): ResourcePolicyConfig {
  const name = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );

  config[ResourceNameSymbol] = name;
  config[ResourceTypeSymbol] = ResourceTypePolicy;

  context.policies[name] = config;

  return config;
}
