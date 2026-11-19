import { createRoutes } from '@appweaver/web';

export default createRoutes({
  modelName: 'Post',
  path: '/posts',
  find: {
    public: true,
    cacheTTL: 60_000
  },
  query: {
    public: true,
    cacheTTL: 60_000
  },
  aggregate: {
    roles: ['Admin'],
    method: 'get-post'
  },
  create: {
    roles: ['Admin', 'User']
  },
  update: {
    roles: ['Admin', 'User']
  },
  delete: {
    roles: ['Admin']
  },
  export: {
    roles: ['Admin']
  },
  fileUpload: {
    roles: ['Admin', 'User']
  },
  fileDelete: {
    roles: ['Admin', 'User'],
    recaptcha: true,
    recaptchaAction: 'delete-post-file'
  },
  // The tools of the AI agents, with the access of the routes above: anyone
  // signed in reads, authors write, only admins aggregate
  mcp: {
    description:
      'The blog posts, each in a category, with tags, written as a Draft and then Published or Archived.',
    actions: ['find', 'query', 'aggregate', 'create', 'update'],
    exclude: ['seo'],
    maxLimit: 20
  }
});
