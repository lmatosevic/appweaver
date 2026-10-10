import { beforeAll, describe, expect, test } from 'bun:test';
import { Application, injectService } from '@appweaver/core';
import { Role } from '@/features/access/roles';
import { testApp } from './support/app';
import {
  account,
  createRoles,
  movie,
  request,
  signIn
} from './support/fixtures';

/**
 * Reviews over HTTP: the rating they keep on the movie, one review per member
 * and movie, the privacy of their authors, and the moderation by curators.
 */
describe('Reviews', () => {
  let app: Application;
  let as: Record<string, Record<string, string>>;

  const review = (
    auth: Record<string, string>,
    movieId: string,
    rating: number
  ) =>
    request(app, 'POST', '/reviews', {
      auth,
      payload: { movie: movieId, rating, title: `Rated ${rating}` }
    });

  const ratingOf = async (movieId: string) => {
    const found: any = await injectService('Movie').find(movieId);
    return { rating: found.rating, ratingCount: found.ratingCount };
  };

  beforeAll(async () => {
    app = await testApp();
    await createRoles();

    as = {
      ana: await signIn(app, await account('Ana')),
      ben: await signIn(app, await account('Ben')),
      curator: await signIn(app, await account('Cora', Role.Curator))
    };
  }, 30_000);

  test('keeps the average rating of the movie', async () => {
    const reviewed = await movie('Reviewed Arrival');

    await review(as.ana, reviewed.id, 9);
    await review(as.ben, reviewed.id, 6);

    expect(await ratingOf(reviewed.id)).toEqual({
      rating: 7.5,
      ratingCount: 2
    });
  });

  test('signs a review with the display name, never the account', async () => {
    const reviewed = await movie('Reviewed Parasite');
    await review(as.ana, reviewed.id, 10);

    const { body } = await request(app, 'POST', '/reviews/query', {
      payload: { filter: { movie: reviewed.id } }
    });

    expect(body.items[0].authorName).toBe('Ana');
    expect(body.items[0]).not.toHaveProperty('author');
    expect(JSON.stringify(body)).not.toContain('@test.example.com');
  });

  test('accepts one review per member and movie', async () => {
    const reviewed = await movie('Reviewed Inception');
    await review(as.ana, reviewed.id, 8);

    const { status, body } = await review(as.ana, reviewed.id, 3);

    expect(status).toBe(409);
    expect(body.code).toBe('ALREADY_REVIEWED');
    expect(body.detail).toMatch(/already reviewed/);
  });

  test('requires an account to review', async () => {
    const reviewed = await movie('Reviewed Spirited Away');

    const { status } = await request(app, 'POST', '/reviews', {
      payload: { movie: reviewed.id, rating: 10 }
    });

    expect(status).toBe(401);
  });

  test('lets only the author edit a review', async () => {
    const reviewed = await movie('Reviewed Mad Max: Fury Road');
    const written = await review(as.ana, reviewed.id, 7);

    const other = await request(app, 'PUT', `/reviews/${written.body.id}`, {
      auth: as.ben,
      payload: { rating: 1 }
    });
    const own = await request(app, 'PUT', `/reviews/${written.body.id}`, {
      auth: as.ana,
      payload: { rating: 9 }
    });

    expect(other.status).toBe(403);
    expect(own.body.rating).toBe(9);
    expect(await ratingOf(reviewed.id)).toEqual({ rating: 9, ratingCount: 1 });
  });

  test('lets a curator remove a review, updating the rating', async () => {
    const reviewed = await movie('Reviewed Dune');
    const spam = await review(as.ben, reviewed.id, 1);
    await review(as.ana, reviewed.id, 9);

    const { status } = await request(
      app,
      'DELETE',
      `/reviews/${spam.body.id}`,
      {
        auth: as.curator
      }
    );

    expect(status).toBe(200);
    expect(await ratingOf(reviewed.id)).toEqual({ rating: 9, ratingCount: 1 });
  });

  test('aggregates the ratings of a movie publicly', async () => {
    const reviewed = await movie('Reviewed Interstellar');
    await review(as.ana, reviewed.id, 10);
    await review(as.ben, reviewed.id, 8);

    const { status, body } = await request(app, 'POST', '/reviews/aggregate', {
      payload: {
        filter: { movie: reviewed.id },
        select: { rating: { avg: true, min: true, max: true, count: true } }
      }
    });

    expect(status).toBe(200);
    expect(body.total.rating).toEqual({ avg: 9, min: 8, max: 10, count: 2 });
  });
});
