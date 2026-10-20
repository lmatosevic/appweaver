import { createPolicy } from '@appweaver/data';

export default createPolicy({
  modelName: 'Page',
  // Rendered on the public site
  files: {
    heroImage: {
      accessType: 'public'
    }
  }
});
