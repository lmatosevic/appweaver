import { createPolicy } from '@appweaver/core';

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
