import { makeHash, randomString, uncapitalize } from '@appweaver/common';
import { apiKeyConfig } from '../../auth-config';
import { createService } from '../../../factory/create-service';
import { checkApiKeyScope, resourceAuthModel } from '../../helper';
import { injectService, currentAuthUser } from '@appweaver/core';
import { ApiKey } from '../../../types/generated';

export default apiKeyConfig.ENABLED
  ? createService({
      modelName: 'ApiKey',
      beforeCreate: (data: ApiKey) => {
        checkScope(data);

        data.key = randomString(64, { special: false });
        data.keyHash = makeHash(data.key);

        // Add relation to the current user when creating a new API Key
        data[uncapitalize(resourceAuthModel()!.name)] = {
          id: currentAuthUser()!.id
        };

        // Enforces max API key duration based on config value
        const maxDuration = apiKeyConfig.MAX_DURATION;
        if (maxDuration) {
          const maxExpiryDate = new Date(Date.now() + maxDuration * 1000);
          if (
            !data.expiresAt ||
            new Date(data.expiresAt).getTime() > maxExpiryDate.getTime()
          ) {
            data.expiresAt = maxExpiryDate;
          }
        }
      },
      beforeUpdate: (_id, data: Partial<ApiKey>) => {
        checkScope(data);
      },
      afterCreate: async (data: ApiKey) => {
        const service = injectService('ApiKey');
        await service.update(data.id, { key: `...${data.key.slice(-6)}` });
        data.key = `${data.id}${apiKeyConfig.DELIMITER}${data.key}`;
      }
    })
  : undefined;

/**
 * Checks that the current user, the owner of the key, gives it only roles and permissions it holds. The scope is also
 * narrowed to the ones the owner still holds on every request, so a service call without a user is not checked.
 */
function checkScope(data: Partial<ApiKey>): void {
  const owner = currentAuthUser();
  if (owner) {
    checkApiKeyScope(owner, data as { roles?: unknown; permissions?: unknown });
  }
}
