import { Type } from '@sinclair/typebox';
import { registerRoute } from '@appweaver/core';
import { Role } from '@/features/access/roles';
import { refreshTrendingScores } from './trending-job';

// The nightly job, on demand
registerRoute(
  (router) => {
    router.post(
      '/movies/trending/refresh',
      {
        schema: {
          tags: ['Movies'],
          summary: 'Recompute the trending scores now',
          description:
            'Runs the nightly job right away. Sort the movies by -trendingScore to read the result.',
          response: {
            200: Type.Object({ updated: Type.Integer() })
          }
        }
      },
      async () => ({ updated: await refreshTrendingScores() })
    );
  },
  { roles: [Role.Admin] }
);
