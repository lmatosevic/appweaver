import { Readable } from 'node:stream';
import {
  config,
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

  const defineService = (items: any[], totalCount: number = items.length) => {
    const query = jest
      .fn()
      .mockImplementation(async (_filter, page: number, size: number) => ({
        items: size === 0 ? [] : items,
        resultCount: size === 0 ? 0 : items.length,
        totalCount
      }));

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

      expect(query).toHaveBeenCalledWith({ views: 10 }, 1, 0, 'title');
      expect(query).toHaveBeenCalledWith(
        { views: 10 },
        1,
        config.EXPORT_BATCH_SIZE,
        'title'
      );
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

    test('ends the stream when a batch query fails', async () => {
      let call = 0;
      define(
        {
          modelName: 'Post',
          query: jest.fn().mockImplementation(async () => {
            call++;
            if (call > 1) {
              throw new Error('connection lost');
            }
            return { items: [], resultCount: 0, totalCount: 10 };
          }),
          [RESOURCE_TYPE]: RESOURCE_SERVICE_TYPE
        },
        'Post'
      );

      const { stream } = await service.exportCsv('Post');

      await expect(readStream(stream)).resolves.toBe('');
    });
  });
});
