import { Readable } from 'node:stream';
import {
  config,
  logger,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE
} from '@appweaver/common';
import { define } from '../../context';
import { ExportService } from '../../export/export-service';
import { createModel } from '../../factory/create-model';
import { HttpError } from '../../errors';
import { resetContext } from '../fixtures/context-fixture';
import { linkModels } from '../fixtures/model-fixture';

const readStream = async (stream: Readable): Promise<string> => {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(String(chunk));
  }
  return chunks.join('');
};

describe('export-service', () => {
  let service: ExportService;

  /**
   * Stubs the Post service, paging the given items with cursors. The cursor is
   * the index the next batch starts at, and is only returned while records
   * follow the batch, matching what the resource service emits.
   */
  const defineService = (
    items: any[],
    batchSize?: number,
    delayMs: number = 0
  ) => {
    const query = jest
      .fn()
      .mockImplementation(
        async (
          _filter: any,
          _page: number,
          size: number,
          _sort: any,
          cursor?: string
        ) => {
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }

          const take = batchSize ?? size;
          const start = cursor ? Number(cursor) : 0;
          const batch = items.slice(start, start + take);
          const end = start + batch.length;

          return {
            items: batch,
            resultCount: batch.length,
            nextCursor: end < items.length ? String(end) : undefined
          };
        }
      );

    define(
      { modelName: 'Post', query, [RESOURCE_TYPE]: RESOURCE_SERVICE_TYPE },
      'Post'
    );

    return query;
  };

  beforeEach(() => {
    resetContext();
    service = new ExportService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    resetContext();
  });

  describe('exportCsv', () => {
    beforeEach(() => {
      createModel({
        name: 'Post',
        scalars: {
          title: { type: 'string' },
          views: { type: 'int' }
        }
      });
      linkModels();
    });

    test('returns a CSV stream with a generated file name', async () => {
      defineService([{ id: 1, title: 'First', views: 10 }]);

      const result = await service.exportCsv('Post');

      expect(result.mimeType).toBe('text/csv');
      expect(result.fileName).toMatch(/^Posts_\d+_\d+\.csv$/);
      expect(result.stream).toBeInstanceOf(Readable);
    });

    test('streams the queried records as CSV rows', async () => {
      defineService([
        { id: 1, title: 'First', views: 10 },
        { id: 2, title: 'Second', views: 20 }
      ]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('First');
      expect(csv).toContain('Second');
    });

    test('queries the records in batches using the given filter and sort', async () => {
      const query = defineService([{ id: 1, title: 'First' }]);

      const { stream } = await service.exportCsv(
        'Post',
        { views: 10 },
        'title'
      );
      await readStream(stream);

      // The export never counts the records, it walks them batch by batch
      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith(
        { views: 10 },
        1,
        config.EXPORT_BATCH_SIZE,
        'title',
        undefined,
        false
      );
    });

    test('follows the cursor of each batch until the records run out', async () => {
      const items = Array.from({ length: 5 }, (_, index) => ({
        id: index + 1,
        title: `Post ${index + 1}`
      }));
      const query = defineService(items, 2);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      // Three batches of two, the last one unfilled and therefore final
      expect(query).toHaveBeenCalledTimes(3);
      expect(query).toHaveBeenNthCalledWith(
        2,
        {},
        1,
        config.EXPORT_BATCH_SIZE,
        '-createdAt',
        '2',
        false
      );
      for (const item of items) {
        expect(csv).toContain(item.title);
      }
    });

    test('writes each batch once when the query resolves slowly', async () => {
      // A stream may ask for more data while a batch is still being awaited, so
      // a slow query is what exposes a batch being written twice
      const items = Array.from({ length: 6 }, (_, index) => ({
        id: index + 1,
        title: `Post ${index + 1}`
      }));
      defineService(items, 2, 5);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      for (const item of items) {
        expect(csv.split(item.title)).toHaveLength(2);
      }
    });

    test('writes the header row only for the first batch', async () => {
      const items = Array.from({ length: 4 }, (_, index) => ({
        id: index + 1,
        title: `Post ${index + 1}`
      }));
      defineService(items, 2);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv.match(/title/g)).toHaveLength(1);
    });

    test('ends the stream without rows when nothing matches', async () => {
      const query = defineService([]);

      const { stream } = await service.exportCsv('Post');

      await expect(readStream(stream)).resolves.toBe('');
      expect(query).toHaveBeenCalledTimes(1);
    });

    test('skips fields that are not part of the model', async () => {
      defineService([{ id: 1, title: 'First', internalFlag: 'hidden' }]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).not.toContain('hidden');
    });

    test('excludes fields configured as excluded', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' }, views: { type: 'int' } },
          export: { views: { exclude: true } }
        },
        true
      );
      linkModels();
      defineService([{ id: 1, title: 'First', views: 99 }]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('First');
      expect(csv).not.toContain('99');
    });

    test('maps a value using the configured mapping function', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          export: {
            title: { mapValue: (value: any) => String(value).toUpperCase() }
          }
        },
        true
      );
      linkModels();
      defineService([{ id: 1, title: 'First' }]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('FIRST');
    });

    test('maps a scalar value from the named field of the record', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          export: { title: { headerName: 'My Title', mapValue: 'title' } }
        },
        true
      );
      linkModels();
      defineService([{ id: 1, title: 'First' }]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('My Title');
      expect(csv).toContain('First');
    });

    test('maps a scalar value from another field of the record', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' }, slug: { type: 'string' } },
          export: { slug: { mapValue: 'title' } }
        },
        true
      );
      linkModels();
      defineService([{ id: 1, title: 'First', slug: 'first-post' }]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('slug');
      expect(csv).not.toContain('first-post');
      expect(csv.split('\n')[1]).toBe('1;First;First');
    });

    test('maps a single file value from the named field of the file', async () => {
      createModel({
        name: 'File',
        scalars: { originalName: { type: 'string' } }
      });
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          files: { coverImage: {} },
          export: { coverImage: { mapValue: 'originalName' } }
        },
        true
      );
      linkModels();
      defineService([
        {
          id: 1,
          title: 'First',
          coverImage: { id: 9, originalName: 'cover.png' }
        }
      ]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('cover.png');
    });

    test('maps every item of a file array from the named field', async () => {
      createModel({
        name: 'File',
        scalars: { originalName: { type: 'string' } }
      });
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          files: { galleryImages: { array: true } },
          export: { galleryImages: { mapValue: 'originalName' } }
        },
        true
      );
      linkModels();
      defineService([
        {
          id: 1,
          title: 'First',
          galleryImages: [
            { id: 9, originalName: 'a.png' },
            { id: 10, originalName: 'b.png' }
          ]
        }
      ]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('a.png,b.png');
    });

    test('keeps the row when the mapping function throws', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          export: {
            title: {
              mapValue: () => {
                throw new Error('mapping failure');
              }
            }
          }
        },
        true
      );
      linkModels();
      defineService([{ id: 1, title: 'First' }]);

      const { stream } = await service.exportCsv('Post');

      await expect(readStream(stream)).resolves.toBeDefined();
    });

    test('adds the header row for the first batch', async () => {
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          export: { title: { headerName: 'Post title' } }
        },
        true
      );
      linkModels();
      defineService([{ id: 1, title: 'First' }]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(config.EXPORT_CSV_ADD_HEADERS).toBe(true);
      expect(csv).toContain('Post title');
    });

    test('keeps an array scalar as a single column', async () => {
      createModel(
        {
          name: 'Post',
          scalars: {
            title: { type: 'string' },
            keywords: { type: 'string', array: true }
          }
        },
        true
      );
      linkModels();
      defineService([{ id: 1, title: 'First', keywords: ['news', 'tech'] }]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('keywords');
      expect(csv).toContain('news');
      expect(csv).toContain('tech');
    });

    test('flattens a single relation into prefixed columns', async () => {
      createModel({ name: 'User', scalars: { email: { type: 'string' } } });
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: {
            author: { model: 'User', type: 'oneToMany', owner: true }
          }
        },
        true
      );
      linkModels();
      defineService([
        { id: 1, title: 'First', author: { id: 7, email: 'ada@mail.com' } }
      ]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('author.email');
      expect(csv).toContain('ada@mail.com');
    });

    test('joins the values of an array relation into a single column', async () => {
      createModel({ name: 'Tag', scalars: { name: { type: 'string' } } });
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          relations: { tags: { model: 'Tag', type: 'manyToMany' } }
        },
        true
      );
      linkModels();
      defineService([
        {
          id: 1,
          title: 'First',
          tags: [
            { id: 2, name: 'News' },
            { id: 3, name: 'Tech' }
          ]
        }
      ]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('tags.name');
      expect(csv).toContain(`News${config.EXPORT_CSV_JOIN_DELIMITER}Tech`);
    });

    test('flattens a single file relation into prefixed columns', async () => {
      createModel({ name: 'File', scalars: { name: { type: 'string' } } });
      createModel(
        {
          name: 'Post',
          scalars: { title: { type: 'string' } },
          files: { image: {} }
        },
        true
      );
      linkModels();
      defineService([
        { id: 1, title: 'First', image: { id: 9, name: 'logo.png' } }
      ]);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      expect(csv).toContain('image.name');
      expect(csv).toContain('logo.png');
    });

    test('throws a server error when the initial query fails', async () => {
      define(
        {
          modelName: 'Post',
          query: jest.fn().mockRejectedValue(new Error('connection lost')),
          [RESOURCE_TYPE]: RESOURCE_SERVICE_TYPE
        },
        'Post'
      );

      await expect(service.exportCsv('Post')).rejects.toBeInstanceOf(HttpError);
      await expect(service.exportCsv('Post')).rejects.toMatchObject({
        statusCode: 500
      });
    });

    test('ends the stream when a following batch query fails', async () => {
      let call = 0;
      define(
        {
          modelName: 'Post',
          query: jest.fn().mockImplementation(async () => {
            call++;
            if (call > 1) {
              throw new Error('connection lost');
            }
            // The cursor makes the export ask for a second batch, which fails
            return {
              items: [{ id: 1, title: 'First' }],
              resultCount: 1,
              nextCursor: 'next'
            };
          }),
          [RESOURCE_TYPE]: RESOURCE_SERVICE_TYPE
        },
        'Post'
      );
      jest.spyOn(logger, 'error').mockImplementation(() => undefined);

      const { stream } = await service.exportCsv('Post');
      const csv = await readStream(stream);

      // The batches already written stay in the stream, which then ends early
      expect(call).toBe(2);
      expect(csv).toContain('First');
    });
  });
});
