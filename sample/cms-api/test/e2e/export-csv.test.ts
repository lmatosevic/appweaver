import { Readable } from 'node:stream';
import {
  Application,
  createApp,
  ExportService,
  inject,
  injectService
} from '@appweaver/core';
import { resetTestData } from './support/reset';

/**
 * Exercises the CSV export against the real database. The test configuration
 * sets the export batch size to two, so a handful of records already makes the
 * export walk several batches and prove that it follows the cursors instead of
 * counting the records up front.
 */
describe('CSV export', () => {
  let app: Application;
  let exportService: ExportService;
  let posts: any;
  let users: any;

  const readStream = async (stream: Readable): Promise<string> => {
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(String(chunk));
    }
    return chunks.join('');
  };

  // The suite keeps a database connection open for its whole run, so the
  // between-test reset cannot drop the records and they are cleared here
  const seed = async (count: number) => {
    await posts.client.deleteMany({});
    await users.client.deleteMany({});

    const author = await users.client.create({
      data: {
        email: 'ana@example.com',
        firstName: 'Ana',
        lastName: 'Anic',
        phone: '01234431'
      }
    });

    for (let index = 1; index <= count; index++) {
      await posts.create({
        title: `Post ${index}`,
        slug: `post-${index}`,
        counter: index,
        author: author.id
      });
    }
  };

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    exportService = inject(ExportService);
    posts = injectService('Post');
    users = injectService('User');
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('streams every record across several batches', async () => {
    await seed(5);

    const { stream } = await exportService.exportCsv('Post', {}, 'id');
    const csv = await readStream(stream);

    for (let index = 1; index <= 5; index++) {
      expect(csv).toContain(`post-${index}`);
    }

    // A single header row, written for the first batch only
    expect(csv.split('\n').filter((row) => row.startsWith('id;'))).toHaveLength(
      1
    );
  });

  test('writes the records in the requested order', async () => {
    await seed(5);

    const { stream } = await exportService.exportCsv('Post', {}, '-counter');
    const csv = await readStream(stream);

    const slugs = csv
      .split('\n')
      .map((row) => row.match(/post-\d+/)?.[0])
      .filter((slug): slug is string => !!slug);

    expect(slugs).toEqual(['post-5', 'post-4', 'post-3', 'post-2', 'post-1']);
  });

  test('applies the filter to the exported records', async () => {
    await seed(5);

    const { stream } = await exportService.exportCsv(
      'Post',
      { counter: { _gt: 3 } },
      'id'
    );
    const csv = await readStream(stream);

    expect(csv).toContain('post-4');
    expect(csv).toContain('post-5');
    expect(csv).not.toContain('post-1');
  });

  test('produces no rows when nothing matches', async () => {
    await seed(5);

    const { stream } = await exportService.exportCsv(
      'Post',
      { counter: { _gt: 100 } },
      'id'
    );

    await expect(readStream(stream)).resolves.toBe('');
  });
});
