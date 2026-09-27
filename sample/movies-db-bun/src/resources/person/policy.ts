import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Person',
  files: {
    photo: {
      accessType: 'public'
    }
  }
});
