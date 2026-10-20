import { uncapitalize } from '@appweaver/common';
import { apiKeyConfig } from '../../auth-config';
import { resourceAuthModel } from '../../helper';
import { createPolicy } from '../../../factory/create-policy';

function authModelField(): string {
  return uncapitalize(resourceAuthModel()!.name);
}

export default apiKeyConfig.ENABLED
  ? createPolicy({
      modelName: 'ApiKey',
      checkAccess: (user, resource, action) => {
        const authFieldName = authModelField();
        const currentAuthId = user!.id;
        if (action === 'create') {
          return resource[authFieldName].id === currentAuthId;
        } else {
          return resource[`${authFieldName}Id`] === currentAuthId;
        }
      },
      readRestrictions: (user) => {
        return { [authModelField()]: { id: user!.id } };
      }
    })
  : undefined;
