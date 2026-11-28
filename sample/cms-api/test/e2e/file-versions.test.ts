import { AuthSource, Database } from '@appweaver/common';
import { Application, createApp, inject, injectService } from '@appweaver/core';
import { FileService } from '@appweaver/data';
import { AuthService } from '@appweaver/web';
import { resetTestData } from './support/reset';

type Part = { name: string; value: string; fileName?: string; type?: string };

/**
 * Exercises the file versions (`storage.versions.enabled`) against the real database and file storage: the comment
 * attachment keeps the default ten versions, a post gallery image three, and the post cover image none.
 */
describe('File versions', () => {
  let app: Application;
  let comments: any;
  let posts: any;
  let auth: Record<string, string>;
  let authorId: number;

  // Written by the signed-in user, who may only change their own posts
  const createPost = async (data: { title: string; slug: string }) => {
    const post = await posts.create(data);
    await posts.client.update({ where: { id: post.id }, data: { authorId } });
    return post;
  };

  const multipart = (parts: Part[]) => {
    const boundary = '----AppweaverFileVersionsBoundary';
    const body = parts
      .map((part) =>
        part.fileName
          ? `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${part.name}"; filename="${part.fileName}"\r\n` +
            `Content-Type: ${part.type ?? 'text/plain'}\r\n\r\n` +
            `${part.value}\r\n`
          : `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${part.name}"\r\n\r\n` +
            `${part.value}\r\n`
      )
      .join('');

    return {
      payload: Buffer.from(`${body}--${boundary}--\r\n`),
      headers: {
        ...auth,
        'content-type': `multipart/form-data; boundary=${boundary}`
      }
    };
  };

  const upload = (path: string, parts: Part[]) =>
    app.server.inject({
      method: 'POST',
      url: `/api/${path}/files`,
      ...multipart(parts)
    });

  const attachment = (value: string): Part => ({
    name: 'attachment',
    fileName: `${value}.txt`,
    value
  });

  const galleryImage = (value: string): Part => ({
    name: 'galleryImages',
    fileName: `${value}.gif`,
    type: 'image/gif',
    value
  });

  const download = (url: string) =>
    app.server.inject({
      method: 'GET',
      url: url.replace(/^https?:\/\/[^/]+/, ''),
      headers: auth
    });

  const seedComment = async () => {
    const post = await createPost({ title: 'Versioned', slug: 'versioned' });
    return comments.create({ body: 'With versions', post: post.id });
  };

  beforeAll(async () => {
    app = await createApp();
    comments = injectService('Comment');
    posts = injectService('Post');

    // The registration data of the sample connects the User role
    await inject<any>(Database)
      .client()
      .role.upsert({
        where: { name: 'User' },
        update: {},
        create: { name: 'User' }
      });

    // Registered without a password, so signed in with tokens of its own,
    // signed by the server once its plugins are loaded
    await app.server.ready();
    const user = await inject(AuthService).registerAuthUser(
      AuthSource.OAuth2Google,
      'file-versions@example.com',
      undefined,
      { firstName: 'File', lastName: 'Versions' }
    );
    const { accessToken } = await inject(AuthService).generateAuthTokens(user);
    auth = { authorization: `Bearer ${accessToken}` };
    authorId = user.id as number;
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await comments.client.deleteMany({});
    await posts.client.deleteMany({});
  });

  describe('single file field', () => {
    test('keeps the replaced file as a previous version', async () => {
      const comment = await seedComment();

      const first = (
        await upload(`comments/${comment.id}`, [attachment('first')])
      ).json().attachment;
      const second = (
        await upload(`comments/${comment.id}`, [attachment('second')])
      ).json().attachment;

      expect(first.version).toBe(1);
      expect(second.version).toBe(2);
      expect(second.supersededAt).toBeNull();

      const found = await comments.find(comment.id);
      expect(found.attachment.name).toBe(second.name);

      // The current file by its name, a previous version only by its number
      expect((await download(second.url)).body).toBe('second');
      expect((await download(`${second.url}?version=1`)).body).toBe('first');
      expect((await download(`${second.url}?version=2`)).body).toBe('second');
      expect((await download(first.url)).statusCode).toBe(404);

      const missing = await download(`${second.url}?version=3`);
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe('FILE_VERSION_NOT_FOUND');
    });

    test('lists the versions of a file, newest first', async () => {
      const comment = await seedComment();
      await upload(`comments/${comment.id}`, [attachment('first')]);
      const current = (
        await upload(`comments/${comment.id}`, [attachment('second')])
      ).json().attachment;

      const response = await app.server.inject({
        method: 'GET',
        url: `/api/comments/${comment.id}/file-versions?name=${encodeURIComponent(current.name)}`,
        headers: auth
      });

      expect(response.statusCode).toBe(200);
      const versions = response.json();
      expect(versions.map((file: any) => file.version)).toEqual([2, 1]);
      expect(versions[0].url).toBe(current.url);
      expect(versions[1].url).toBe(`${current.url}?version=1`);
      expect(versions[1].supersededAt).not.toBeNull();
    });

    test('rejects a replace naming another file', async () => {
      const comment = await seedComment();
      await upload(`comments/${comment.id}`, [attachment('first')]);

      const response = await upload(`comments/${comment.id}`, [
        { name: 'attachment:replace', value: 'unknown.txt' },
        attachment('second')
      ]);

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('FILE_UPLOAD_FAILED');
      expect(JSON.stringify(response.json())).toContain(
        'FILE_REPLACE_TARGET_INVALID'
      );

      const found = await comments.find(comment.id);
      expect(found.attachment.version).toBe(1);
    });

    test('deleting the latest version restores the previous one', async () => {
      const comment = await seedComment();
      const first = (
        await upload(`comments/${comment.id}`, [attachment('first')])
      ).json().attachment;
      const second = (
        await upload(`comments/${comment.id}`, [attachment('second')])
      ).json().attachment;

      const response = await app.server.inject({
        method: 'POST',
        url: `/api/comments/${comment.id}/delete-file-versions`,
        headers: auth,
        payload: { attachment: { name: second.name, version: 'latest' } }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().map((file: any) => file.version)).toEqual([2]);

      const found = await comments.find(comment.id);
      expect(found.attachment.name).toBe(first.name);
      expect(found.attachment.supersededAt).toBeNull();
      expect((await download(first.url)).body).toBe('first');
      expect((await download(second.url)).statusCode).toBe(404);
    });

    test('deletes a previous version alone', async () => {
      const comment = await seedComment();
      await upload(`comments/${comment.id}`, [attachment('first')]);
      const second = (
        await upload(`comments/${comment.id}`, [attachment('second')])
      ).json().attachment;

      const response = await app.server.inject({
        method: 'POST',
        url: `/api/comments/${comment.id}/delete-file-versions`,
        headers: auth,
        payload: { attachment: [{ name: second.name, version: 1 }] }
      });

      expect(response.statusCode).toBe(200);
      expect((await download(second.url)).body).toBe('second');
      expect((await download(`${second.url}?version=1`)).statusCode).toBe(404);
    });

    test('deleting the file deletes all its versions', async () => {
      const comment = await seedComment();
      await upload(`comments/${comment.id}`, [attachment('first')]);
      const second = (
        await upload(`comments/${comment.id}`, [attachment('second')])
      ).json().attachment;

      await inject(FileService).deleteFiles(
        { attachment: second.name },
        comment,
        comments.client
      );

      const found = await comments.find(comment.id);
      expect(found.attachment).toBeNull();
      expect(
        await inject<any>(Database)
          .client()
          .file.count({
            where: { resourceName: 'Comment', resourceId: comment.id }
          })
      ).toBe(0);
    });
  });

  describe('array file field', () => {
    test('replaces a named file, keeping the others', async () => {
      const post = await createPost({ title: 'Gallery', slug: 'gallery' });

      const [a, b] = (
        await upload(`posts/${post.id}`, [
          galleryImage('a1'),
          galleryImage('b1')
        ])
      ).json().galleryImages;

      const replaced = (
        await upload(`posts/${post.id}`, [
          { name: 'galleryImages:replace', value: a.name },
          galleryImage('a2')
        ])
      ).json().galleryImages[0];

      expect(replaced.version).toBe(2);

      const found = await posts.client.findFirst({
        where: { id: post.id },
        include: { galleryImages: true }
      });
      expect(found.galleryImages.map((file: any) => file.name).sort()).toEqual(
        [b.name, replaced.name].sort()
      );
      expect((await download(`${replaced.url}?version=1`)).body).toBe('a1');
    });

    test('deleting the latest version links the previous one again', async () => {
      const post = await createPost({ title: 'Restored', slug: 'restored' });
      const first = (
        await upload(`posts/${post.id}`, [galleryImage('a1')])
      ).json().galleryImages[0];
      const second = (
        await upload(`posts/${post.id}`, [
          { name: 'galleryImages:replace', value: first.name },
          galleryImage('a2')
        ])
      ).json().galleryImages[0];

      // The route inherits the reCAPTCHA of the file delete route of posts
      const response = await app.server.inject({
        method: 'POST',
        url: `/api/posts/${post.id}/delete-file-versions`,
        headers: auth,
        payload: { galleryImages: [{ name: second.name, version: 'latest' }] }
      });
      expect(response.json().code).toBe('RECAPTCHA_MISSING');

      const deleted = await inject(FileService).deleteVersions(
        { galleryImages: [{ name: second.name, version: 'latest' }] },
        post,
        posts.client
      );

      expect(deleted.map((file) => file.name)).toEqual([second.name]);
      const found = await posts.client.findFirst({
        where: { id: post.id },
        include: { galleryImages: true }
      });
      expect(found.galleryImages.map((file: any) => file.name)).toEqual([
        first.name
      ]);
      expect((await download(first.url)).body).toBe('a1');
    });

    test('a failed upload restores the files it replaced', async () => {
      const post = await createPost({ title: 'Failed', slug: 'failed' });
      const first = (
        await upload(`posts/${post.id}`, [galleryImage('a1')])
      ).json().galleryImages[0];

      const response = await upload(`posts/${post.id}`, [
        { name: 'galleryImages:replace', value: first.name },
        galleryImage('a2'),
        { name: 'galleryImages', fileName: 'notes.txt', value: 'text' }
      ]);

      expect(response.statusCode).toBe(400);
      const found = await posts.client.findFirst({
        where: { id: post.id },
        include: { galleryImages: true }
      });
      expect(found.galleryImages).toMatchObject([
        { name: first.name, version: 1, supersededAt: null }
      ]);
      expect((await download(first.url)).body).toBe('a1');
    });

    test('keeps at most the max count of versions', async () => {
      const post = await createPost({ title: 'Pruned', slug: 'pruned' });
      let current = (
        await upload(`posts/${post.id}`, [galleryImage('v1')])
      ).json().galleryImages[0];

      for (const value of ['v2', 'v3', 'v4', 'v5']) {
        current = (
          await upload(`posts/${post.id}`, [
            { name: 'galleryImages:replace', value: current.name },
            galleryImage(value)
          ])
        ).json().galleryImages[0];
      }

      const versions = await inject(FileService).listVersions(
        current.name,
        post,
        posts.client
      );
      expect(versions.map((file) => file.version)).toEqual([5, 4, 3]);
      expect((await download(`${current.url}?version=3`)).body).toBe('v3');
      expect((await download(`${current.url}?version=2`)).statusCode).toBe(404);
    });
  });

  describe('file field without versions', () => {
    test('rejects a version of the file', async () => {
      const post = await createPost({ title: 'Cover', slug: 'cover' });
      // A 4x4 PNG, the cover image accepting only JPEG, PNG and WebP
      const cover = await inject(FileService).saveBuffer(
        'coverImage',
        {
          name: 'cover.png',
          mimeType: 'image/png',
          data: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4IScHRwzEcQCxYxBB16puEAAAAABJRU5ErkJggg==',
            'base64'
          )
        },
        post,
        posts.client
      );

      const response = await download(`${cover.url}?version=1`);

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('FILE_VERSIONING_DISABLED');
    });
  });
});
