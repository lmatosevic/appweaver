import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Brand',
  files: {
    logo: {
      accessType: 'public'
    }
  }
});
