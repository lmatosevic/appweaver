import { createRoutes } from '@appweaver/web';

// The address book of the signed-in customer, the policy scopes every action
export default createRoutes({
  modelName: 'Address',
  path: '/addresses',
  aggregate: {
    exclude: true
  },
  export: {
    exclude: true
  }
});
