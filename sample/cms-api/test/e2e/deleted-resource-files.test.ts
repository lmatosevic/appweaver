import { Database, Storage } from '@appweaver/common';
import {
  Application,
  createApp,
  FileService,
  inject,
  injectService
} from '@appweaver/core';
import { resetTestData } from './support/reset';

/**
 * The stored files of a deleted resource follow the options of their field: a
 * resource removed from the database loses them by default, a soft deleted one
 * keeps them. A kept file stays in the storage and the database for audit, but
 * is no longer served. Runs against the real database and file storage.
 */
describe('Files of deleted resources', () => {
  let app: Application;
  let posts: any;
  let users: any;
  let files: any;

  // A 4x4 PNG, resized by the image processing of the file fields
  const image = {
    name: 'image.png',
    mimeType: 'image/png',
    data: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4IScHRwzEcQCxYxBB16puEAAAAABJRU5ErkJggg==',
      'base64'
    )
  };

  const download = async (file: any) =>
    app.server.inject({ method: 'GET', url: new URL(file.url).pathname });

  const isStored = async (file: any) => inject(Storage).exists(file.name);

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    posts = injectService('Post');
    users = injectService('User');
    files = inject<any>(Database as any).client().file;

    // The first request prepares the server, which outlasts a test timeout
    await app.server.inject({ method: 'GET', url: '/api' });
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('retains the files of a soft deleted resource without serving them', async () => {
    const post = await posts.create({ title: 'Covered post', slug: 'covered' });
    const cover = await inject(FileService).saveBuffer(
      'coverImage',
      image,
      post,
      posts.client
    );
    expect((await download(cover)).statusCode).toBe(200);

    await posts.delete(post.id);

    expect(await isStored(cover)).toBe(true);

    const postRecord = await posts.client.findFirst({ where: { id: post.id } });
    const fileRecord = await files.findFirst({ where: { name: cover.name } });
    expect(fileRecord.deletedAt).toEqual(postRecord.deletedAt);

    expect((await download(cover)).statusCode).toBe(404);
  });

  test('removes the files of a resource removed from the database', async () => {
    const user = await users.create({
      firstName: 'File',
      lastName: 'Owner',
      email: 'file-owner@example.com',
      phone: '+38512345678',
      password: 'F1leOwner!Pass'
    });
    const avatar = await inject(FileService).saveBuffer(
      'avatar',
      image,
      user,
      users.client
    );
    expect(await isStored(avatar)).toBe(true);

    await users.delete(user.id);

    expect(await isStored(avatar)).toBe(false);
    expect(await files.findFirst({ where: { name: avatar.name } })).toBeNull();
  });
});
