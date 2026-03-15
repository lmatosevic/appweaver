import { createRoutes } from '../../../factory';

export default createRoutes({
  modelName: 'ApiKey',
  aggregate: {
    exclude: true
  },
  export: {
    exclude: true
  }
});
