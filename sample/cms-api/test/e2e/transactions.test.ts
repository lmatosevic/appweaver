import {
  Application,
  createApp,
  FileService,
  inject,
  injectService,
  runTransaction
} from '@appweaver/core';
import { Database, Events, Storage } from '@appweaver/common';
import { resetTestData } from './support/reset';

/**
 * Exercises `runTransaction` against the real database and file storage: the
 * writes of several services commit or roll back together, and the events and
 * the file removals wait for the commit.
 */
describe('Transactions', () => {
  let app: Application;
  let categories: any;
  let tags: any;
  let posts: any;
  // Resolved once, the way an application module holds its client
  let db: any;

  const image = {
    name: 'image.png',
    mimeType: 'image/png',
    data: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4IScHRwzEcQCxYxBB16puEAAAAABJRU5ErkJggg==',
      'base64'
    )
  };

  const category = (slug: string) =>
    categories.create({ name: slug, slug: `tx-${slug}` });

  const categoryExists = async (slug: string) =>
    (await db.category.count({ where: { slug: `tx-${slug}` } })) > 0;

  const isStored = (fileName: string) => inject(Storage).exists(fileName);

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    categories = injectService('Category');
    tags = injectService('Tag');
    posts = injectService('Post');
    db = inject<any>(Database as any).client();
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await db.category.deleteMany({ where: { slug: { startsWith: 'tx-' } } });
    await db.tag.deleteMany({ where: { slug: { startsWith: 'tx-' } } });
  });

  describe('runTransaction', () => {
    test('commits the writes of several services together', async () => {
      const result = await runTransaction(async () => {
        await category('commit');
        await tags.create({ name: 'tx-commit', slug: 'tx-commit' });
        return 'done';
      });

      expect(result).toBe('done');
      expect(await categoryExists('commit')).toBe(true);
      expect(await db.tag.count({ where: { slug: 'tx-commit' } })).toBe(1);
    });

    test('rolls back every write when the function throws', async () => {
      const error = new Error('Checkout failed');

      await expect(
        runTransaction(async () => {
          await category('rollback');
          await tags.create({ name: 'tx-rollback', slug: 'tx-rollback' });
          throw error;
        })
      ).rejects.toBe(error);

      expect(await categoryExists('rollback')).toBe(false);
      expect(await db.tag.count({ where: { slug: 'tx-rollback' } })).toBe(0);
    });

    test('keeps the writes when an error is caught inside', async () => {
      await runTransaction(async () => {
        await category('caught');
        try {
          await categories.find(999_999);
        } catch {
          // A missing record is an expected outcome here
        }
      });

      expect(await categoryExists('caught')).toBe(true);
    });

    test('joins a nested transaction and a client resolved beforehand', async () => {
      await expect(
        runTransaction(async () => {
          await runTransaction(() => category('nested'));
          await db.tag.create({ data: { name: 'tx-raw', slug: 'tx-raw' } });
          throw new Error('Rolled back');
        })
      ).rejects.toThrow('Rolled back');

      expect(await categoryExists('nested')).toBe(false);
      expect(await db.tag.count({ where: { slug: 'tx-raw' } })).toBe(0);
    });

    test('reads its own writes through the transaction client', async () => {
      const count = await runTransaction(async (tx) => {
        await category('visible');
        return tx.category.count({ where: { slug: 'tx-visible' } });
      });

      expect(count).toBe(1);
    });

    test('runs serializable on SQLite whatever isolation level is asked for', async () => {
      await runTransaction('ReadCommitted', () => category('isolation'));

      expect(await categoryExists('isolation')).toBe(true);
    });
  });

  describe('deferred side effects', () => {
    test('emits the resource events once the transaction commits', async () => {
      const listener = jest.fn();
      const events = inject(Events);
      const listenerId = events.onResourceEvent('Category', 'create', listener);

      try {
        await runTransaction(async () => {
          await category('event');
          expect(listener).not.toHaveBeenCalled();
        });
        expect(listener).toHaveBeenCalledTimes(1);

        listener.mockClear();
        await runTransaction(async () => {
          await category('event-rollback');
          throw new Error('Rolled back');
        }).catch(() => undefined);
        expect(listener).not.toHaveBeenCalled();
      } finally {
        events.removeResourceEvent(listenerId);
      }
    });

    test('keeps a file deleted in a rolled back transaction', async () => {
      const post = await posts.create({ title: 'Tx post', slug: 'tx-file' });
      const cover = await inject(FileService).saveBuffer(
        'coverImage',
        image,
        post,
        posts.client
      );

      await runTransaction(async () => {
        await inject(FileService).deleteFile(
          cover.name,
          'coverImage',
          post,
          posts.client
        );
        throw new Error('Rolled back');
      }).catch(() => undefined);

      expect(await isStored(cover.name)).toBe(true);
      expect(await db.file.count({ where: { name: cover.name } })).toBe(1);

      await runTransaction(() =>
        inject(FileService).deleteFile(
          cover.name,
          'coverImage',
          post,
          posts.client
        )
      );

      expect(await isStored(cover.name)).toBe(false);
      expect(await db.file.count({ where: { name: cover.name } })).toBe(0);
      await posts.delete(post.id);
    });

    test('removes a file stored in a rolled back transaction', async () => {
      const post = await posts.create({ title: 'Tx post', slug: 'tx-upload' });
      let fileName = '';

      await runTransaction(async () => {
        const cover = await inject(FileService).saveBuffer(
          'coverImage',
          image,
          post,
          posts.client
        );
        fileName = cover.name;
        throw new Error('Rolled back');
      }).catch(() => undefined);

      expect(fileName).not.toBe('');
      expect(await isStored(fileName)).toBe(false);
      expect(await db.file.count({ where: { name: fileName } })).toBe(0);
      await posts.delete(post.id);
    });
  });
});
