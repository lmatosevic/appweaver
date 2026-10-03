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
 * The public catalog over HTTP: queries needing no account, the cast and crew
 * of a movie, the filmography of a person, the similar movies, and who may
 * change the catalog.
 */
describe('Catalog', () => {
  let app: Application;
  let arrival: any;
  let director: any;
  let curator: Record<string, string>;
  let member: Record<string, string>;

  beforeAll(async () => {
    app = await testApp();
    await createRoles();

    arrival = await movie('Arrival', ['Science Fiction', 'Drama'], {
      releaseDate: '2016-11-11T00:00:00.000Z',
      runtimeMinutes: 116
    });
    await movie('Blade Runner 2049', ['Science Fiction', 'Drama', 'Thriller']);
    await movie('Interstellar', ['Science Fiction', 'Adventure']);
    await movie('The Grand Budapest Hotel', ['Comedy']);

    const people = injectService('Person');
    director = await people.create({
      name: 'Denis Villeneuve',
      slug: 'denis-villeneuve',
      knownFor: 'Directing',
      birthDate: new Date('1967-10-03T00:00:00.000Z')
    });
    const lead = await people.create({
      name: 'Amy Adams',
      slug: 'amy-adams'
    });

    const credits = injectService('Credit');
    await credits.create({
      movie: arrival.id,
      person: director.id,
      role: 'Director'
    });
    await credits.create({
      movie: arrival.id,
      person: lead.id,
      role: 'Cast',
      character: 'Louise Banks'
    });

    curator = await signIn(app, await account('Curt', Role.Curator));
    member = await signIn(app, await account('Mona'));
  }, 30_000);

  test('lists the movies of a genre without an account', async () => {
    const { status, body } = await request(app, 'POST', '/movies/query', {
      payload: {
        filter: { genres: { _some: { slug: 'drama' } } },
        sort: 'title'
      }
    });

    expect(status).toBe(200);
    expect(body.items.map((item: any) => item.title)).toEqual([
      'Arrival',
      'Blade Runner 2049'
    ]);
  });

  test('searches the titles, ignoring the case', async () => {
    const { body } = await request(app, 'POST', '/movies/query', {
      payload: { filter: { searchText: 'budapest' } }
    });

    expect(body.items.map((item: any) => item.title)).toEqual([
      'The Grand Budapest Hotel'
    ]);
  });

  test('reads a movie with its cast and crew', async () => {
    const { body } = await request(app, 'GET', `/movies/${arrival.id}`);

    expect(body).toMatchObject({ year: 2016, runtime: '1h 56m' });
    expect(
      body.credits.map((credit: any) => [credit.role, credit.person.name])
    ).toContainEqual(['Director', 'Denis Villeneuve']);
    expect(body.creditsCount).toBe(2);
  });

  test('reads the filmography of a person', async () => {
    const { body } = await request(app, 'GET', `/people/${director.id}`);

    expect(body.credits.map((credit: any) => credit.movie.title)).toEqual([
      'Arrival'
    ]);
    expect(body.age).toBeGreaterThanOrEqual(58);
  });

  test('ranks the similar movies by the genres they share', async () => {
    const { body } = await request(
      app,
      'GET',
      `/movies/${arrival.id}/similar?limit=5`
    );

    expect(body.items.map((item: any) => item.title)).toEqual([
      'Blade Runner 2049',
      'Interstellar'
    ]);
  });

  test('lets a curator add a movie, reusing the genres by slug', async () => {
    const { status, body } = await request(app, 'POST', '/movies', {
      auth: curator,
      payload: {
        title: 'Dune',
        slug: 'dune',
        genres: [
          { name: 'Science Fiction', slug: 'science-fiction' },
          { name: 'Space Opera', slug: 'space-opera' }
        ]
      }
    });

    expect(status).toBe(201);
    expect(body.genres.map((genre: any) => genre.slug).sort()).toEqual([
      'science-fiction',
      'space-opera'
    ]);

    const genres = await injectService('Genre').query({
      filter: { slug: 'science-fiction' }
    });
    expect(genres.totalCount).toBe(1);
  });

  test('keeps the catalog from members', async () => {
    const { status } = await request(app, 'POST', '/movies', {
      auth: member,
      payload: { title: 'Bootleg', slug: 'bootleg' }
    });

    expect(status).toBe(403);
  });

  test('ignores a rating sent with the movie', async () => {
    const { body } = await request(app, 'PUT', `/movies/${arrival.id}`, {
      auth: curator,
      payload: { rating: 10, tagline: 'Why are they here?' }
    });

    expect(body).toMatchObject({ rating: 0, tagline: 'Why are they here?' });
  });
});
