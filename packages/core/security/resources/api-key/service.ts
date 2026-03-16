import {
  config,
  makeHash,
  randomString,
  uncapitalize
} from '@appweaver/common';
import { createService } from '../../../factory';
import { currentAuthUser, resourceAuthModel } from '../../helper';
import { injectService } from '../../../context';
import { ApiKey } from '../../../types';

export default config.SECURITY_API_KEY_ENABLED
  ? createService({
      modelName: 'ApiKey',
      beforeCreate: (data: ApiKey) => {
        data.key = randomString(64, { special: false });
        data.keyHash = makeHash(data.key);

        // Add relation to the current user when creating a new API Key
        data[uncapitalize(resourceAuthModel()!.name)] = {
          id: currentAuthUser()!.id
        };

        // Enforces max API key duration based on config value
        const maxDuration = config.SECURITY_API_KEY_MAX_DURATION;
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
      afterCreate: async (data: ApiKey) => {
        const service = injectService('ApiKey');
        await service.update(data.id, { key: `...${data.key.slice(-6)}` });
      }
    })
  : undefined;
