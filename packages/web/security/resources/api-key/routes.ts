import { apiKeyConfig } from '@appweaver/data';
import { createRoutes } from '../../../factory/create-routes';

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
