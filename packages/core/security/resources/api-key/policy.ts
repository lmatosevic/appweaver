import { config, uncapitalize } from '@appweaver/common';
import { createPolicy } from '../../../factory';
import { resourceAuthModel, currentAuthUser } from '../../helper';

function authModelField(): string {
  return uncapitalize(resourceAuthModel()!.name);
}

export default config.SECURITY_API_KEY_ENABLED
  ? createPolicy({
      modelName: 'ApiKey',
      checkAccess: (action, resource) => {
        const authFieldName = authModelField();
        const currentAuthId = currentAuthUser()!.id;
        if (action === 'create') {
          return resource[authFieldName].id === currentAuthId;
        } else {
          return resource[`${authFieldName}Id`] === currentAuthId;
        }
      },
      readRestrictions: () => {
        return { [authModelField()]: { id: currentAuthUser()!.id } };
      }
    })
  : undefined;
