import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'User',
  // Shown next to the byline on the public site
  files: {
    avatar: {
      accessType: 'public'
    }
  }
});
