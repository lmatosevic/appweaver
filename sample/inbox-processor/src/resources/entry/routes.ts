import { createRoutes } from '@appweaver/web';

// Anyone reads the entries, they are written only through the inbox
export default createRoutes({
  modelName: 'Entry',
  find: {
    public: true
  },
  query: {
    public: true
  },
  aggregate: {
    public: true
  },
  create: {
    exclude: true
  },
  update: {
    exclude: true
  },
  delete: {
    roles: ['Admin']
  },
  export: {
    roles: ['Admin']
  }
});
