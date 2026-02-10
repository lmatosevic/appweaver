import path from 'node:path';
import { capitalize, ResourcePolicyConfig } from '@appweaver/common';
import { context } from '../context';

export function createPolicy(
  config: ResourcePolicyConfig
): ResourcePolicyConfig {
  const name = capitalize(
    config.name || path.basename(path.dirname(__dirname))
  );

  context.policies[name] = config;

  return config;
}
