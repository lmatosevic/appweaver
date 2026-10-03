import {
  capitalize,
  logger,
  ModelName,
  RESOURCE_NAME,
  RESOURCE_POLICY_TYPE,
  RESOURCE_TYPE,
  ResourcePolicyConfig,
  ResourceRecord
} from '@appweaver/common';
import { define } from '../context';

/**
 * Creates the policy of a model, checking the access to its records and restricting the reads and writes. Once the
 * types are generated, the records the callbacks receive are typed by the model name.
 *
 * @param {ResourcePolicyConfig} config - The policy configuration with the model name and the policy callbacks.
 * @param {boolean} [override=false] - Whether to replace a policy already defined for the model.
 * @return {ResourcePolicyConfig} The created policy, defined in the application context.
 */
export function createPolicy<N extends ModelName, T = ResourceRecord<N>>(
  config: ResourcePolicyConfig<T> & { modelName: N },
  override: boolean = false
): ResourcePolicyConfig<T> {
  config[RESOURCE_NAME] = capitalize(config.modelName);
  config[RESOURCE_TYPE] = RESOURCE_POLICY_TYPE;

  logger.debug({ modelName: config.modelName }, 'Created resource policy');

  define(config, undefined, override ? 'override' : undefined);

  return config;
}
