import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Page',
  // Rendered on the public site
  files: {
    heroImage: {
      accessType: 'public'
    }
  }
});
