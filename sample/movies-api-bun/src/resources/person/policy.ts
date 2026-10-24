import { createPolicy } from '@appweaver/data';

export default createPolicy({
  modelName: 'Person',
  files: {
    photo: {
      accessType: 'public'
    }
  }
});
