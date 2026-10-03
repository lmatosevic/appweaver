import {
  Database,
  RESOURCE_MODEL_TYPE,
  RESOURCE_TYPE,
  Storage
} from '@appweaver/common';
import { context, define } from '../../context';
import { CacheService } from '../../cache';
import { FileService } from '../../storage/file-service';
import { currentAuthUser } from '../../security';
import { withoutPolicies } from '../../utils';
import { resetContext } from '../fixtures/context-fixture';

jest.mock('../../security', () => ({
  ...jest.requireActual('../../security'),
  currentAuthUser: jest.fn()
}));

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

    describe('upload check', () => {
      const canCreate = jest.fn();

      const save = () =>
        service.saveBuffer(
          'avatar',
          {
            name: 'avatar.pdf',
            mimeType: 'application/pdf',
            data: Buffer.from('avatar content')
          },
          resource,
          client
        );

      beforeEach(() => {
        context.resource.policies.set('User', {
          modelName: 'User',
          files: { avatar: { canCreate } }
        });
      });

      afterEach(() => {
        canCreate.mockReset();
      });

      test('runs with a null user for an anonymous request', async () => {
        canCreate.mockReturnValue(true);

        await save();

        expect(canCreate).toHaveBeenCalledWith(
          null,
          resource,
          expect.objectContaining({ resourceField: 'avatar' })
        );
      });

      test('denies the upload an async check rejects', async () => {
        canCreate.mockResolvedValue(false);

        await expect(save()).rejects.toMatchObject({ statusCode: 403 });
        expect(storage.store).not.toHaveBeenCalled();
      });

      test('is skipped with internal access', async () => {
        canCreate.mockResolvedValue(false);

        await expect(withoutPolicies(save)).resolves.toMatchObject({
          resourceField: 'avatar'
        });
        expect(canCreate).not.toHaveBeenCalled();
      });
    });
  });

  describe('deleteFile', () => {
    const canDelete = jest.fn();
    const file = {
      name: 'avatar-1.pdf',
      resourceName: 'User',
      resourceField: 'avatar',
      resourceId: '1'
    };

    const deleteFile = () =>
      service.deleteFile(file.name, 'avatar', resource, client);

    beforeEach(() => {
      dbClient.file.findFirst = jest.fn().mockResolvedValue(file);
      context.resource.policies.set('User', {
        modelName: 'User',
        files: { avatar: { canDelete } }
      });
    });

    afterEach(() => {
      canDelete.mockReset();
    });

    test('runs the delete check with a null user for an anonymous request', async () => {
      canDelete.mockReturnValue(true);

      await deleteFile();

      expect(canDelete).toHaveBeenCalledWith(null, resource, file);
      expect(storage.delete).toHaveBeenCalledWith(file.name);
    });

    test('denies the delete an async check rejects', async () => {
      canDelete.mockResolvedValue(false);

      await expect(deleteFile()).rejects.toMatchObject({ statusCode: 403 });
      expect(storage.delete).not.toHaveBeenCalled();
    });

    test('skips the delete check with internal access', async () => {
      canDelete.mockResolvedValue(false);

      await withoutPolicies(deleteFile);

      expect(canDelete).not.toHaveBeenCalled();
      expect(storage.delete).toHaveBeenCalledWith(file.name);
    });
  });

  describe('stream', () => {
    const file = {
      name: 'avatar-1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 3,
      resourceName: 'User',
      resourceField: 'avatar',
      resourceId: '1'
    };

    beforeEach(() => {
      context.resource.models.set('File', {
        name: 'File',
        config: { name: 'File', softDelete: true },
        [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE
      } as any);
      context.resource.policies.set('User', {
        modelName: 'User',
        files: { avatar: { accessType: 'public' } }
      } as any);

      storage.stream = jest.fn().mockResolvedValue({ size: 3 });
      dbClient.file.findFirst = jest.fn().mockResolvedValue(file);
      dbClient.user = { count: jest.fn() };
    });

    test('streams a public file without looking up its resource', async () => {
      await expect(service.stream(file.name)).resolves.toMatchObject({
        mimeType: 'application/pdf'
      });
      expect(dbClient.user.count).not.toHaveBeenCalled();
    });

    test('serves only a file that is not retained for a deleted resource', async () => {
      await service.stream(file.name);

      expect(dbClient.file.findFirst).toHaveBeenCalledWith({
        where: { name: file.name, deletedAt: null }
      });
    });

    describe('protected file', () => {
      const canAccess = jest.fn();

      beforeEach(() => {
        jest.mocked(currentAuthUser).mockReturnValue({
          id: 2,
          email: 'reader@test.com',
          roles: []
        });
        context.resource.services.set('User', {
          find: jest.fn().mockResolvedValue(resource)
        } as any);
        // No access type declared, so the default one applies
        context.resource.policies.set('User', {
          modelName: 'User',
          files: { avatar: { canAccess } }
        });
      });

      afterEach(() => {
        jest.mocked(currentAuthUser).mockReset();
        canAccess.mockReset();
      });

      test('applies the custom access check by default', async () => {
        canAccess.mockReturnValue(false);

        await expect(service.stream(file.name)).rejects.toMatchObject({
          statusCode: 403
        });
        expect(canAccess).toHaveBeenCalledWith(
          expect.objectContaining({ id: 2 }),
          resource,
          file
        );
      });

      test('streams the file the custom access check allows', async () => {
        canAccess.mockReturnValue(true);

        await expect(service.stream(file.name)).resolves.toMatchObject({
          mimeType: 'application/pdf'
        });
      });

      test('denies an anonymous request', async () => {
        jest.mocked(currentAuthUser).mockReturnValue(undefined);

        await expect(service.stream(file.name)).rejects.toMatchObject({
          statusCode: 403
        });
      });
    });

    test('responds to a retained file as to a missing one', async () => {
      dbClient.file.findFirst.mockResolvedValue(null);

      await expect(service.stream(file.name)).rejects.toMatchObject({
        statusCode: 404
      });
      expect(storage.stream).not.toHaveBeenCalled();
    });
  });

  describe('deleteResourcesFiles', () => {
    test('deletes the files of every given resource', async () => {
      dbClient.file.findMany = jest
        .fn()
        .mockResolvedValue([{ name: 'a.pdf', resourceId: '1' }]);

      const files = await service.deleteResourcesFiles('User', [1, 2]);

      expect(dbClient.file.findMany).toHaveBeenCalledWith({
        where: {
          resourceName: 'User',
          resourceId: { in: ['1', '2'] },
          resourceField: { in: ['avatar'] }
        }
      });
      expect(storage.delete).toHaveBeenCalledWith('a.pdf');
      expect(files).toEqual([{ name: 'a.pdf', resourceId: '1' }]);
    });

    test('deletes only the files a soft delete removes', async () => {
      context.resource.models.set(
        'User',
        model({
          avatar: {},
          document: { onResourceSoftDeleted: 'delete' },
          badge: { onResourceDeleted: 'keep', onResourceSoftDeleted: 'delete' }
        }) as any
      );
      dbClient.file.findMany = jest.fn().mockResolvedValue([]);

      await service.deleteResourcesFiles('User', [1], true);

      expect(dbClient.file.findMany).toHaveBeenCalledWith({
        where: {
          resourceName: 'User',
          resourceId: { in: ['1'] },
          resourceField: { in: ['document', 'badge'] }
        }
      });
    });

    test('keeps the files of a field that opts out of a delete', async () => {
      context.resource.models.set(
        'User',
        model({
          avatar: {},
          badge: { onResourceDeleted: 'keep', onResourceSoftDeleted: 'delete' }
        }) as any
      );
      dbClient.file.findMany = jest.fn().mockResolvedValue([]);

      await service.deleteResourcesFiles('User', [1]);

      expect(
        dbClient.file.findMany.mock.calls[0][0].where.resourceField
      ).toEqual({ in: ['avatar'] });
    });

    test('skips the lookup without resources to clean up', async () => {
      dbClient.file.findMany = jest.fn();

      await expect(service.deleteResourcesFiles('User', [])).resolves.toEqual(
        []
      );
      expect(dbClient.file.findMany).not.toHaveBeenCalled();
    });
  });
});
