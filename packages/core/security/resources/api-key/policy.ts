import { config } from '@appweaver/common';
import { createPolicy } from '../../../factory';
import { currentAuthUser } from '../../helper';

export default config.SECURITY_API_KEY_ENABLED
  ? createPolicy({
      modelName: 'ApiKey',
      checkAccess: (_, resource) => {
        return resource.authId === currentAuthUser()!.id;
      },
      readRestrictions: () => {
        return { authId: currentAuthUser()!.id };
      },
      writeRestrictions: () => {
        return { authId: currentAuthUser()!.id };
      }
    })
  : undefined;
