import { createPolicy } from '@appweaver/data';

export default createPolicy({
  modelName: 'Movie',
  files: {
    poster: {
      accessType: 'public'
    },
    stills: {
      accessType: 'public'
    }
  }
});
