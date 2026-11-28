import { uncapitalize } from '@appweaver/common';
import { apiKeyConfig } from '../../auth-config';
import { resourceAuthModel } from '../../helper';
import { createPolicy } from '../../../factory/create-policy';

function authModelField(): string {
  return uncapitalize(resourceAuthModel()!.name);
}

// A user manages their own keys only, an anonymous request none. The application's own calls skip the policies
export default apiKeyConfig.ENABLED
  ? createPolicy({
      modelName: 'ApiKey',
      checkAccess: (user, resource, action) => {
        if (!user) {
          return false;
        }
        const authFieldName = authModelField();
        if (action === 'create') {
          return resource[authFieldName]?.id === user.id;
        }
        return resource[`${authFieldName}Id`] === user.id;
      },
      readRestrictions: (user) =>
        user
          ? { [authModelField()]: { id: user.id } }
          : { id: { in: [] as string[] } }
    })
  : undefined;
