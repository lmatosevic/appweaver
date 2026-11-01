import { AuthType, ErrorCode } from '@appweaver/common';
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
      // A key is given only roles and permissions its owner holds
      create: { errorCodes: [ErrorCode.AuthApiKeyPermissionDenied] },
      update: { errorCodes: [ErrorCode.AuthApiKeyPermissionDenied] },
      replace: { errorCodes: [ErrorCode.AuthApiKeyPermissionDenied] },
      aggregate: {
        exclude: true
      },
      export: {
        exclude: true
      }
    })
  : undefined;
