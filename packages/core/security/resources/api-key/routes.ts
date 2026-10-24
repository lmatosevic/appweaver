import { apiKeyConfig } from '../../security-config';
import { createRoutes } from '../../../factory';

export default apiKeyConfig.ENABLED
  ? createRoutes({
      modelName: 'ApiKey',
      aggregate: {
        exclude: true
      },
      export: {
        exclude: true
      }
    })
  : undefined;
