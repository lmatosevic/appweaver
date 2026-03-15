import { config } from '@appweaver/common';
import { createRoutes } from '../../../factory';

export default config.SECURITY_API_KEY_ENABLED
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
