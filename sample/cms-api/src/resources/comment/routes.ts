import { createRoutes } from '@appweaver/web';

export default createRoutes({
  modelName: 'Comment',
  path: '/comments',
  find: {
    public: true
  },
  query: {
    public: true
  },
  aggregate: {
    exclude: true
  },
  // Open to readers who are not signed in, so rate limited by IP
  create: {
    public: true,
    rateLimit: {
      max: 5,
      timeWindow: '1 minute'
    }
  },
  export: {
    roles: ['Admin']
  },
  // An agent reads the comments and moderates them as an admin, never seeing
  // the email of a guest
  mcp: {
    description:
      'The comments of the readers on the posts, Pending until approved or marked as Spam.',
    actions: [
      'find',
      'query',
      {
        action: 'update',
        roles: ['Admin'],
        description: 'Moderates a comment: sets its status to Approved or Spam.'
      }
    ],
    exclude: ['guestEmail']
  }
});
