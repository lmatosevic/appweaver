import { AuthType } from '@appweaver/common';
import { apiKeyConfig } from '@appweaver/data';
import { createRoutes } from '../../../factory/create-routes';
import { apiKeyRoutesConfig } from '../../security-config';

// Only a JWT session manages the keys, so a leaked key cannot create new ones
export default apiKeyConfig.ENABLED && apiKeyRoutesConfig.ROUTES_ENABLED
  ? createRoutes({
      modelName: 'ApiKey',
      defaults: {
        auth: [AuthType.Jwt]
      },
      aggregate: {
        exclude: true
      },
      export: {
        exclude: true
      }
    })
  : undefined;
