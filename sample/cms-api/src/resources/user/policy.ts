import { createPolicy } from '@appweaver/data';

export default createPolicy({
  modelName: 'User',
  // Shown next to the byline on the public site
  files: {
    avatar: {
      accessType: 'public'
    }
  }
});
