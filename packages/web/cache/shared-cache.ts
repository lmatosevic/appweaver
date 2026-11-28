import {
  capitalize,
  ConfigurationError,
  ErrorCode,
  ResourcePolicyConfig
} from '@appweaver/common';
import { injectModel, injectPolicy } from '@appweaver/core';

/**
 * Checks that the responses of a read route of a model cannot depend on the user, so its cache may share one entry
 * between every user (`scope: 'shared'`): neither the policy of the model nor the one of a model its responses
 * include restricts the reads (`readRestrictions`) or checks the access (`checkAccess`) of a user.
 *
 * @param {string} modelName - The model of the route.
 * @param {string} routeName - The route, named in the error.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` naming the policy reading the user.
 */
export function assertSharedCache(modelName: string, routeName: string): void {
  for (const model of [modelName, ...includedModels(modelName)]) {
    const policy: ResourcePolicyConfig | undefined = injectPolicy(model, false);
    if (policy?.readRestrictions || policy?.checkAccess) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `The ${routeName} route of ${modelName} cannot cache its responses in the shared scope: the policy of ` +
          `${model} reads the user (readRestrictions or checkAccess), use the user scope`
      );
    }
  }
}

/** The models a model includes in its responses, through every level of its relations. */
function includedModels(modelName: string, seen = new Set<string>()): string[] {
  const relations = injectModel(modelName, false)?.config?.relations ?? {};
  for (const relation of Object.values(relations)) {
    const related = capitalize(relation.model);
    if (relation.output?.type !== 'none' && !seen.has(related)) {
      seen.add(related);
      includedModels(related, seen);
    }
  }
  return [...seen];
}
