import { createPolicy } from '@appweaver/data';

export default createPolicy({
  modelName: 'Brand',
  files: {
    logo: {
      accessType: 'public'
    }
  }
});
