import {
  Database,
  RESOURCE_MODEL_TYPE,
  RESOURCE_TYPE,
  Storage
} from '@appweaver/common';
import { context, define } from '../../context';
import { CacheService } from '../../cache';
import { FileService } from '../../storage/file-service';
import { resetContext } from '../fixtures/context-fixture';

describe('file-service', () => {
  let storage: any;
  let dbClient: any;
  let client: any;
  let service: FileService;

  const resource = { id: 1, email: 'user@test.com' };

  const model = (files: Record<string, any>) => ({
    name: 'User',
    config: { name: 'User', files },
    [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE
  });

  beforeEach(() => {
    resetContext();

    context.resource.models.set(
      'User',
      model({ avatar: { mimeType: 'application/pdf' } }) as any
    );

    storage = {
      exists: jest.fn().mockResolvedValue(false),
      store: jest.fn().mockImplementation(async (name: string, stream: any) => {
        // Drain the stream so the teed checksum branch can complete
        for await (const _ of stream);
        return name;
      }),
      delete: jest.fn().mockResolvedValue(true)
    };
    define(storage, Storage as any);

    dbClient = {
      file: {
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn().mockResolvedValue({})
      }
    };
    define({ client: () => dbClient }, Database as any);

    define(
      {
        buildCacheKey: jest.fn(),
        getCachedValue: jest.fn(),
        addToCache: jest.fn(),
        removeCachedValue: jest.fn(),
        invalidateCache: jest.fn()
      },
      CacheService
    );

    client = {
      name: 'User',
      findFirst: jest.fn().mockResolvedValue({ avatar: null }),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({
        avatar: { id: 1, ...data.avatar.create }
      }))
    };

    service = new FileService();
  });

  afterAll(() => {
    resetContext();
  });

  describe('saveBuffer', () => {
    test('stores the buffer and links the file to the resource field', async () => {
      const file = await service.saveBuffer(
        'avatar',
        {
          name: 'avatar.pdf',
          mimeType: 'application/pdf',
          data: Buffer.from('avatar content')
        },
        resource,
        client
      );

      expect(storage.store).toHaveBeenCalledWith(
        expect.stringMatching(/^avatar-.+\.pdf$/),
        expect.anything()
      );

      expect(client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: {
            avatar: {
              create: expect.objectContaining({
                originalName: 'avatar.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 14,
                resourceField: 'avatar',
                resourceName: 'User',
                resourceId: '1'
              })
            }
          }
        })
      );

      // The bytes written to storage, counted while they are streamed there
      expect(file).toMatchObject({
        sizeBytes: 14,
        checksum: expect.any(String),
        url: expect.stringContaining('/avatar-')
      });
    });

    test('checks the size limit against the reported content size', async () => {
      context.resource.models.set(
        'User',
        model({
          avatar: { mimeType: 'application/pdf', maxSize: '10 B' }
        }) as any
      );

      await expect(
        service.saveBuffer(
          'avatar',
          {
            name: 'avatar.pdf',
            mimeType: 'application/pdf',
            size: 100,
            data: Buffer.from('tiny')
          },
          resource,
          client
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('applies the name pattern configured for the file field', async () => {
      context.resource.models.set(
        'User',
        model({
          avatar: {
            mimeType: 'application/pdf',
            namePattern: 'avatars/{resourceId}-{name}.{extension}'
          }
        }) as any
      );

      await service.saveBuffer(
        'avatar',
        {
          name: 'avatar.pdf',
          mimeType: 'application/pdf',
          data: Buffer.from('avatar content')
        },
        resource,
        client
      );

      expect(storage.store).toHaveBeenCalledWith(
        'avatars/1-avatar.pdf',
        expect.anything()
      );
    });

    test('rejects a file field the model does not configure', async () => {
      await expect(
        service.saveBuffer(
          'picture',
          {
            name: 'avatar.pdf',
            mimeType: 'application/pdf',
            data: Buffer.from('avatar content')
          },
          resource,
          client
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(storage.store).not.toHaveBeenCalled();
    });

    test('rejects a media type the file field does not allow', async () => {
      await expect(
        service.saveBuffer(
          'avatar',
          {
            name: 'avatar.txt',
            mimeType: 'text/plain',
            data: Buffer.from('avatar content')
          },
          resource,
          client
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(storage.store).not.toHaveBeenCalled();
    });

    test('removes the stored file when it exceeds the configured size limit', async () => {
      context.resource.models.set(
        'User',
        model({
          avatar: { mimeType: 'application/pdf', maxSize: '5 B' }
        }) as any
      );

      await expect(
        service.saveBuffer(
          'avatar',
          {
            name: 'avatar.pdf',
            mimeType: 'application/pdf',
            data: Buffer.from('avatar content')
          },
          resource,
          client
        )
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(storage.delete).toHaveBeenCalled();
      expect(client.update).not.toHaveBeenCalled();
    });
  });
});
