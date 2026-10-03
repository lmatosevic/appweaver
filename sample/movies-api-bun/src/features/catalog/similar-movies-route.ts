import { Type } from '@sinclair/typebox';
import { HttpError, injectService, registerRoute } from '@appweaver/core';
import db from '@db/client';

registerRoute(
  (router) => {
    router.get(
      '/movies/:id/similar',
      {
        schema: {
          tags: ['Movies'],
          summary: 'Movies similar to the given one',
          description:
            'The movies sharing the most genres with it, the better rated first.',
          params: Type.Object({ id: Type.String() }),
          querystring: Type.Object({
            limit: Type.Integer({ minimum: 1, maximum: 20, default: 5 })
          }),
          response: {
            200: Type.Object({ items: Type.Array(Type.Ref('MovieMultiple')) })
          }
        }
      },
      async (req) => {
        const movie = await db.movie.findUnique({
          where: { id: req.params.id },
          select: { genres: { select: { id: true } } }
        });
        if (!movie) {
          throw new HttpError('Movie not found', 404);
        }

        const genreIds = movie.genres.map((genre) => genre.id);
        const { items } = await injectService('Movie').query({
          filter: {
            id: { _ne: req.params.id },
            genres: { _some: { id: { _in: genreIds } } }
          },
          size: 100,
          sort: '-rating',
          totalCount: false
        });

        const shared = (candidate: (typeof items)[number]) =>
          (candidate.genres ?? []).filter((genre) =>
            genreIds.includes(genre.id)
          ).length;

        return {
          items: [...items]
            .sort((a, b) => shared(b) - shared(a) || b.rating - a.rating)
            .slice(0, req.query.limit)
        };
      }
    );
  },
  { public: true, cacheTTL: 300_000, cacheModelName: 'Movie' }
);
