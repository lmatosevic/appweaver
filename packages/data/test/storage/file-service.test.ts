import { Readable } from 'node:stream';
import {
  configOverrides,
  ConfigurationError,
  Database,
  ErrorCode,
  RESOURCE_MODEL_TYPE,
  RESOURCE_TYPE,
  Storage
} from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { define, CacheService, currentAuthUser } from '@appweaver/core';
import { FileService } from '../../storage/file-service';
import { withoutPolicies } from '../../utils/policy-util';
import { resetContext } from '@appweaver/testing';

jest.mock('@appweaver/core/context/auth-context', () => ({
  ...jest.requireActual('@appweaver/core/context/auth-context'),
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
        expect.anything(),
        { contentType: 'application/pdf' }
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
      ).rejects.toMatchObject({ code: ErrorCode.FileTooLarge });
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
        expect.anything(),
        { contentType: 'application/pdf' }
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
      ).rejects.toMatchObject({ code: ErrorCode.FileFieldNotFound });

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
      ).rejects.toMatchObject({ code: ErrorCode.FileUnsupportedType });

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
      ).rejects.toMatchObject({ code: ErrorCode.FileTooLarge });

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

        await expect(save()).rejects.toMatchObject({
          code: ErrorCode.FileForbidden
        });
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

      await expect(deleteFile()).rejects.toMatchObject({
        code: ErrorCode.FileForbidden
      });
      expect(storage.delete).not.toHaveBeenCalled();
    });

    test('skips the delete check with internal access', async () => {
      canDelete.mockResolvedValue(false);

      await withoutPolicies(deleteFile);

      expect(canDelete).not.toHaveBeenCalled();
      expect(storage.delete).toHaveBeenCalledWith(file.name);
    });
  });

  describe('download', () => {
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
    });

    test('names the redirect after the file, not the directory of its name', async () => {
      storage.url = jest.fn().mockResolvedValue('https://cdn.test/a.pdf');
      dbClient.file.findFirst = jest
        .fn()
        .mockResolvedValue({ ...file, name: 'covers/2026/avatar-1.pdf' });

      await expect(
        service.download('covers/2026/avatar-1.pdf')
      ).resolves.toEqual(expect.objectContaining({ fileName: 'avatar-1.pdf' }));
    });

    test('returns the URL of a storage serving its files directly', async () => {
      storage.url = jest
        .fn()
        .mockResolvedValue('https://cdn.test/avatar-1.pdf');

      await expect(service.download(file.name)).resolves.toEqual({
        url: 'https://cdn.test/avatar-1.pdf',
        fileName: 'avatar-1.pdf',
        mimeType: 'application/pdf'
      });
      expect(storage.stream).not.toHaveBeenCalled();
      expect(storage.url).toHaveBeenCalledWith(file.name, {
        expiresIn: 900_000
      });
    });

    test('streams the file from a storage without URLs', async () => {
      storage.url = jest.fn().mockResolvedValue(null);

      await expect(service.download(file.name)).resolves.toMatchObject({
        content: { size: 3 },
        mimeType: 'application/pdf'
      });
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
        where: { name: file.name, supersededAt: null, deletedAt: null }
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
          code: ErrorCode.FileForbidden
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
          code: ErrorCode.FileForbidden
        });
      });
    });

    test('responds to a retained file as to a missing one', async () => {
      dbClient.file.findFirst.mockResolvedValue(null);

      await expect(service.stream(file.name)).rejects.toMatchObject({
        code: ErrorCode.FileNotFound
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

describe('file-service versions', () => {
  type Row = Record<string, any>;

  let rows: Row[];
  let nextId: number;
  let stored: Map<string, string>;
  // The resource, with the foreign keys of its single file fields
  let owner: { id: number; gallery: number[]; [key: string]: any };
  let storage: any;
  let users: any;
  let service: FileService;

  const resource = { id: 1 };
  const other = { id: 2 };

  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR') {
        return (value as Row[]).some((condition) => matches(row, condition));
      }
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('lt' in value) {
          return row[key] != null && row[key] < value.lt;
        }
        if ('in' in value) {
          return value.in.includes(row[key]);
        }
      }
      return (row[key] ?? null) === value;
    });

  const byId = (id: number | null) => rows.find((row) => row.id === id) ?? null;

  const files = {
    findFirst: jest.fn(
      async ({ where }: Row) => rows.find((row) => matches(row, where)) ?? null
    ),
    findMany: jest.fn(async ({ where, orderBy }: Row) => {
      const found = rows.filter((row) => matches(row, where));
      return orderBy ? found.sort((a, b) => b.version - a.version) : found;
    }),
    count: jest.fn(
      async ({ where }: Row) => rows.filter((row) => matches(row, where)).length
    ),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = rows.find((candidate) => matches(candidate, where))!;
      return Object.assign(row, data);
    }),
    delete: jest.fn(async ({ where }: Row) => {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) {
        throw new Error('Record not found');
      }
      rows = rows.filter((candidate) => candidate !== row);
      // The foreign key of a single field is set to null, like the relation
      for (const key of ['avatarId', 'documentId']) {
        if (owner[key] === row.id) {
          owner[key] = null;
        }
      }
      owner.gallery = owner.gallery.filter((id) => id !== row.id);
      return row;
    })
  };

  const withFiles = () => ({
    ...owner,
    avatar: byId(owner.avatarId),
    document: byId(owner.documentId),
    gallery: owner.gallery.map(byId)
  });

  const relate = (field: string, op: Row) => {
    if (op.create) {
      const row = {
        id: nextId++,
        version: 1,
        lineageId: null,
        supersededAt: null,
        deletedAt: null,
        ...op.create
      };
      rows.push(row);
      if (field === 'gallery') {
        owner.gallery.push(row.id);
      } else {
        owner[`${field}Id`] = row.id;
      }
    }
    if (op.disconnect) {
      owner.gallery = owner.gallery.filter((id) => id !== op.disconnect.id);
    }
    if (op.connect) {
      if (field === 'gallery') {
        owner.gallery.push(op.connect.id);
      } else {
        owner[`${field}Id`] = op.connect.id;
      }
    }
  };

  const textFile = (fieldname: string, content: string) => ({
    type: 'file' as const,
    fieldname,
    filename: `${content}.txt`,
    encoding: '7bit',
    mimetype: 'text/plain',
    file: Object.assign(Readable.from([Buffer.from(content)]), {
      bytesRead: content.length,
      truncated: false
    })
  });

  const replacePart = (fieldname: string, value: string) => ({
    type: 'field' as const,
    fieldname: `${fieldname}:replace`,
    value
  });

  async function* partsOf(...parts: any[]) {
    yield* parts;
  }

  const save = (field: string, content: string, replace?: string) =>
    service.saveBuffer(
      field,
      {
        name: `${content}.txt`,
        mimeType: 'text/plain',
        data: Buffer.from(content)
      },
      resource,
      users,
      replace
    );

  const setFiles = (files: Record<string, any>) =>
    context.resource.models.set('User', {
      name: 'User',
      config: { name: 'User', files },
      [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE
    } as any);

  beforeEach(() => {
    resetContext();
    configOverrides.STORAGE_VERSIONS_ENABLED = true;

    rows = [];
    nextId = 1;
    stored = new Map();
    owner = { id: 1, avatarId: null, documentId: null, gallery: [] };

    setFiles({
      avatar: { mimeType: 'text/plain' },
      gallery: { mimeType: 'text/plain', array: true, maxCount: 2 },
      document: { mimeType: 'text/plain', versions: false }
    });
    context.resource.policies.set('User', {
      modelName: 'User',
      files: {
        avatar: { accessType: 'public' },
        gallery: { accessType: 'public' },
        document: { accessType: 'public' }
      }
    } as any);

    storage = {
      exists: jest.fn(async (name: string) => stored.has(name)),
      store: jest.fn(async (name: string, stream: any) => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        stored.set(name, Buffer.concat(chunks).toString());
        return name;
      }),
      delete: jest.fn(async (name: string) => stored.delete(name)),
      url: jest.fn().mockResolvedValue(undefined),
      stream: jest.fn(async (name: string) => ({
        size: stored.get(name)?.length ?? 0,
        stream: Readable.from([stored.get(name) ?? ''])
      }))
    };
    define(storage, Storage as any);

    users = {
      name: 'User',
      findFirst: jest.fn(async () => withFiles()),
      update: jest.fn(async ({ data }: Row) => {
        for (const [field, op] of Object.entries(data)) {
          relate(field, op as Row);
        }
        return withFiles();
      })
    };
    const dbClient = { file: files, user: users };
    define(
      {
        client: () => dbClient,
        transaction: (fn: (tx: unknown) => unknown) => fn(dbClient)
      },
      Database as any
    );

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

    service = new FileService();
  });

  let afterRestore: (() => void) | undefined;

  afterEach(() => {
    afterRestore?.();
    afterRestore = undefined;
    service.onDestroy();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
    jest.useRealTimers();
  });

  afterAll(() => {
    resetContext();
  });

  describe('saving', () => {
    test('keeps the replaced file of a single field as its previous version', async () => {
      const first = await save('avatar', 'first');
      const second = await save('avatar', 'second');

      expect(first.version).toBe(1);
      expect(second).toMatchObject({ version: 2, lineageId: String(first.id) });
      expect(byId(first.id)?.supersededAt).toBeInstanceOf(Date);
      expect(owner.avatarId).toBe(second.id);
      expect(stored.get(first.name)).toBe('first');
    });

    test('numbers every version of a file after its first one', async () => {
      const first = await save('avatar', 'first');
      await save('avatar', 'second');
      const third = await save('avatar', 'third');

      expect(third).toMatchObject({ version: 3, lineageId: String(first.id) });
    });

    test('replaces the named file of an array field', async () => {
      const [a] = await service.saveFiles(
        partsOf(textFile('gallery', 'a1'), textFile('gallery', 'b1')),
        resource,
        users
      );

      const [replaced] = await service.saveFiles(
        partsOf(replacePart('gallery', a.name), textFile('gallery', 'a2')),
        resource,
        users
      );

      expect(replaced.version).toBe(2);
      expect(owner.gallery).toHaveLength(2);
      expect(owner.gallery).not.toContain(a.id);
      expect(owner.gallery).toContain(replaced.id);
    });

    test('rejects a replace of a file the array field does not have', async () => {
      await expect(
        service.saveFiles(
          partsOf(
            replacePart('gallery', 'missing.txt'),
            textFile('gallery', 'a')
          ),
          resource,
          users
        )
      ).rejects.toMatchObject({ code: ErrorCode.FileUploadFailed });
      expect(rows).toHaveLength(0);
    });

    test('rejects a replace of another file of a single field', async () => {
      await save('avatar', 'first');

      await expect(save('avatar', 'second', 'other.txt')).rejects.toMatchObject(
        { code: ErrorCode.FileReplaceTargetInvalid }
      );
    });

    test('rejects a replace naming no file after it, or a file twice', async () => {
      const a = await save('gallery', 'a');

      for (const parts of [
        partsOf(replacePart('gallery', a.name)),
        partsOf(
          replacePart('gallery', a.name),
          replacePart('gallery', a.name),
          textFile('gallery', 'a2')
        )
      ]) {
        const error = await service
          .saveFiles(parts, resource, users)
          .catch((e) => e);
        expect(error.code).toBe(ErrorCode.FileUploadFailed);
        expect(error.details.errors[0].code).toBe(
          ErrorCode.FileReplaceTargetInvalid
        );
      }
    });

    test('restores the replaced files of a failed upload', async () => {
      const a = await save('gallery', 'a1');

      await expect(
        service.saveFiles(
          partsOf(replacePart('gallery', a.name), textFile('gallery', 'a2'), {
            ...textFile('gallery', 'img'),
            mimetype: 'image/png'
          }),
          resource,
          users
        )
      ).rejects.toMatchObject({ code: ErrorCode.FileUploadFailed });

      expect(rows).toEqual([expect.objectContaining({ id: a.id })]);
      expect(byId(a.id)?.supersededAt).toBeNull();
      expect(owner.gallery).toEqual([a.id]);
    });

    test('saves a multipart file as a new version of the named one', async () => {
      const a = await save('gallery', 'a1');

      const replaced = await service.saveFile(
        textFile('gallery', 'a2'),
        resource,
        users,
        a.name
      );

      expect(replaced).toMatchObject({ version: 2, lineageId: String(a.id) });
    });

    test('fails a replace on a database error', async () => {
      const a = await save('gallery', 'a1');
      files.findFirst.mockRejectedValueOnce(new Error('Database down'));

      await expect(save('gallery', 'a2', a.name)).rejects.toBeDefined();
    });

    test('deletes the new files of a failed upload', async () => {
      await expect(
        service.saveFiles(
          partsOf(textFile('gallery', 'a1'), {
            ...textFile('gallery', 'img'),
            mimetype: 'image/png'
          }),
          resource,
          users
        )
      ).rejects.toMatchObject({ code: ErrorCode.FileUploadFailed });

      expect(rows).toHaveLength(0);
      expect(stored.size).toBe(0);
    });

    test('reports a replaced file a failed upload cannot restore', async () => {
      const a = await save('gallery', 'a1');
      const update = files.update.getMockImplementation()!;
      files.update.mockImplementation(async (args: Row) => {
        if (args.data.supersededAt === null) {
          throw new Error('Database down');
        }
        return update(args);
      });
      afterRestore = () => files.update.mockImplementation(update);

      await expect(
        service.saveFiles(
          partsOf(replacePart('gallery', a.name), textFile('gallery', 'a2'), {
            ...textFile('gallery', 'img'),
            mimetype: 'image/png'
          }),
          resource,
          users
        )
      ).rejects.toMatchObject({ code: ErrorCode.FileUploadFailed });
    });

    test('keeps the file count of an array field on a replace', async () => {
      const a = await save('gallery', 'a');
      await save('gallery', 'b');

      await expect(save('gallery', 'a2', a.name)).resolves.toMatchObject({
        version: 2
      });
      await expect(save('gallery', 'c')).rejects.toMatchObject({
        code: ErrorCode.FileLimitExceeded
      });
    });

    test('rejects a replace of a field without versions', async () => {
      const document = await save('document', 'first');

      await expect(
        save('document', 'second', document.name)
      ).rejects.toMatchObject({ code: ErrorCode.FileVersioningDisabled });
    });

    test('deletes the replaced file and its versions without file versions', async () => {
      await save('avatar', 'first');
      await save('avatar', 'second');
      configOverrides.STORAGE_VERSIONS_ENABLED = false;

      const third = await save('avatar', 'third');

      expect(rows.map((row) => row.name)).toEqual([third.name]);
      expect([...stored.keys()]).toEqual([third.name]);
    });
  });

  describe('pruning', () => {
    test('keeps at most the max count of versions', async () => {
      configOverrides.STORAGE_VERSIONS_MAX_COUNT = 2;

      await save('avatar', 'first');
      await save('avatar', 'second');
      const third = await save('avatar', 'third');

      expect(rows.map((row) => row.version)).toEqual([2, 3]);
      expect(stored.has(third.name)).toBe(true);
    });

    test('keeps every version with a max count of 0', async () => {
      configOverrides.STORAGE_VERSIONS_MAX_COUNT = 0;

      for (const content of ['1', '2', '3', '4']) {
        await save('avatar', content);
      }

      expect(rows).toHaveLength(4);
    });

    test('deletes the versions older than the max age of the field', async () => {
      setFiles({
        avatar: { mimeType: 'text/plain', versions: { maxAge: '1h' } }
      });
      const first = await save('avatar', 'first');
      await save('avatar', 'second');
      byId(first.id)!.supersededAt = new Date(Date.now() - 2 * 3_600_000);

      await save('avatar', 'third');

      expect(rows.map((row) => row.version)).toEqual([2, 3]);
    });

    test('deletes the expired versions of every field with a max age', async () => {
      setFiles({
        avatar: { mimeType: 'text/plain', versions: { maxAge: '1d' } }
      });
      const first = await save('avatar', 'first');
      await save('avatar', 'second');

      await expect(service.pruneExpiredVersions()).resolves.toBe(0);
      await expect(
        service.pruneExpiredVersions(new Date(Date.now() + 2 * 86_400_000))
      ).resolves.toBe(1);
      expect(byId(first.id)).toBeNull();
    });

    test('logs a failed prune without failing the upload', async () => {
      await save('avatar', 'first');
      files.findMany.mockRejectedValueOnce(new Error('Database down'));

      await expect(save('avatar', 'second')).resolves.toMatchObject({
        version: 2
      });
    });

    test('runs the expired versions deletes every prune interval', async () => {
      jest.useFakeTimers();
      setFiles({
        avatar: { mimeType: 'text/plain', versions: { maxAge: '1d' } }
      });
      const prune = jest
        .spyOn(service, 'pruneExpiredVersions')
        .mockResolvedValue(0);

      service.onReady();
      jest.advanceTimersByTime(3_600_000);

      expect(prune).toHaveBeenCalledTimes(2);

      service.onDestroy();
      jest.advanceTimersByTime(3_600_000);
      expect(prune).toHaveBeenCalledTimes(2);
    });

    test('logs a failed run of the expired versions deletes', async () => {
      setFiles({
        avatar: { mimeType: 'text/plain', versions: { maxAge: '1d' } }
      });
      const prune = jest
        .spyOn(service, 'pruneExpiredVersions')
        .mockRejectedValue(new Error('Database down'));

      service.onReady();
      await Promise.resolve();

      expect(prune).toHaveBeenCalledTimes(1);
    });

    test('runs no deletes without a max age or with versions disabled', () => {
      const prune = jest.spyOn(service, 'pruneExpiredVersions');

      service.onReady();
      configOverrides.STORAGE_VERSIONS_ENABLED = false;
      configOverrides.STORAGE_VERSIONS_MAX_AGE = '1d';
      service.onReady();

      expect(prune).not.toHaveBeenCalled();
    });

    test('rejects a prune interval that is not a duration', () => {
      configOverrides.STORAGE_VERSIONS_MAX_AGE = '1d';
      configOverrides.STORAGE_VERSIONS_PRUNE_INTERVAL = 'hourly';

      expect(() => service.onReady()).toThrow(ConfigurationError);
    });

    test('fails the lookup of the expired versions on a database error', async () => {
      setFiles({
        avatar: { mimeType: 'text/plain', versions: { maxAge: '1d' } }
      });
      files.findMany.mockRejectedValueOnce(new Error('Database down'));

      await expect(service.pruneExpiredVersions()).rejects.toBeDefined();
    });
  });

  describe('reading', () => {
    test('serves a previous version only by the name of the current file', async () => {
      const first = await save('avatar', 'first');
      const second = await save('avatar', 'second');

      await service.stream(second.name, undefined, 1);
      expect(storage.stream).toHaveBeenLastCalledWith(first.name, 0, undefined);

      await service.download(second.name, undefined, 2);
      expect(storage.stream).toHaveBeenLastCalledWith(
        second.name,
        0,
        undefined
      );

      await expect(service.stream(first.name)).rejects.toMatchObject({
        code: ErrorCode.FileNotFound
      });
    });

    test('rejects a version that does not exist', async () => {
      const first = await save('avatar', 'first');

      await expect(
        service.stream(first.name, undefined, 2)
      ).rejects.toMatchObject({ code: ErrorCode.FileVersionNotFound });

      await save('avatar', 'second');
      const current = await service.findByName(rows[1].name);
      await expect(service.findVersion(current, 5)).rejects.toMatchObject({
        code: ErrorCode.FileVersionNotFound
      });
      await expect(service.findVersion(current, 'latest')).resolves.toBe(
        current
      );
    });

    test('hides the versions older than the max age', async () => {
      setFiles({
        avatar: { mimeType: 'text/plain', versions: { maxAge: '1h' } }
      });
      const first = await save('avatar', 'first');
      const second = await save('avatar', 'second');
      byId(first.id)!.supersededAt = new Date(Date.now() - 2 * 3_600_000);

      await expect(
        service.stream(second.name, undefined, 1)
      ).rejects.toMatchObject({ code: ErrorCode.FileVersionNotFound });
    });

    test('rejects a version of a field without versions', async () => {
      const document = await save('document', 'doc');

      await expect(
        service.stream(document.name, undefined, 1)
      ).rejects.toMatchObject({ code: ErrorCode.FileVersioningDisabled });
    });

    test('rejects a version with file versions disabled', async () => {
      const first = await save('avatar', 'first');
      configOverrides.STORAGE_VERSIONS_ENABLED = false;

      await expect(
        service.stream(first.name, undefined, 1)
      ).rejects.toMatchObject({ code: ErrorCode.FileVersioningDisabled });
    });

    test('lists the versions newest first, with the URL serving each one', async () => {
      await save('avatar', 'first');
      const second = await save('avatar', 'second');

      const versions = await service.listVersions(second.name, resource, users);

      expect(versions.map((file) => file.version)).toEqual([2, 1]);
      expect(versions[0].url).toMatch(/\/files\/public\/second-.+\.txt$/);
      expect(versions[1].url).toBe(`${versions[0].url}?version=1`);
    });

    test('lists the versions of a file of the resource only', async () => {
      const first = await save('avatar', 'first');

      await expect(
        service.listVersions(first.name, other, users)
      ).rejects.toMatchObject({ code: ErrorCode.FileForbidden });
    });

    test('fails the lookup of the versions on a database error', async () => {
      await save('avatar', 'first');
      const second = await save('avatar', 'second');
      files.findMany.mockRejectedValueOnce(new Error('Database down'));

      await expect(
        service.listVersions(second.name, resource, users)
      ).rejects.toBeDefined();
    });
  });

  describe('deleting', () => {
    test('deleting the latest version makes the previous one current', async () => {
      const first = await save('avatar', 'first');
      const second = await save('avatar', 'second');

      const deleted = await service.deleteVersions(
        { avatar: { name: second.name, version: 'latest' } },
        resource,
        users
      );

      expect(deleted.map((file) => file.name)).toEqual([second.name]);
      expect(owner.avatarId).toBe(first.id);
      expect(byId(first.id)?.supersededAt).toBeNull();
      expect(stored.has(second.name)).toBe(false);
    });

    test('links the previous version of an array field again', async () => {
      const a = await save('gallery', 'a1');
      const b = await save('gallery', 'a2', a.name);

      await service.deleteVersions(
        { gallery: [{ name: b.name, version: 2 }] },
        resource,
        users
      );

      expect(owner.gallery).toEqual([a.id]);
    });

    test('fails the delete of the latest version on a database error', async () => {
      await save('avatar', 'first');
      const second = await save('avatar', 'second');
      files.delete.mockRejectedValueOnce(new Error('Database down'));

      await expect(
        service.deleteVersions(
          { avatar: { name: second.name, version: 'latest' } },
          resource,
          users
        )
      ).rejects.toMatchObject({ code: ErrorCode.FileDeleteFailed });
    });

    test('deletes the only version as the file itself', async () => {
      const first = await save('avatar', 'first');

      await service.deleteVersions(
        { avatar: { name: first.name, version: 'latest' } },
        resource,
        users
      );

      expect(rows).toHaveLength(0);
      expect(owner.avatarId).toBeNull();
    });

    test('deletes a previous version alone', async () => {
      const first = await save('avatar', 'first');
      const second = await save('avatar', 'second');

      const [deleted] = await service.deleteVersions(
        { avatar: [{ name: second.name, version: 1 }] },
        resource,
        users
      );

      expect(deleted.url).toMatch(/\?version=1$/);
      expect(byId(first.id)).toBeNull();
      expect(owner.avatarId).toBe(second.id);
    });

    test('fails when no version could be deleted', async () => {
      const first = await save('avatar', 'first');

      await expect(
        service.deleteVersions({}, resource, users)
      ).rejects.toMatchObject({ code: ErrorCode.FileNoneProvided });
      await expect(
        service.deleteVersions(
          { avatar: { name: first.name, version: 3 } },
          resource,
          users
        )
      ).rejects.toMatchObject({ code: ErrorCode.FileDeleteFailed });
      await expect(
        service.deleteVersions(
          { gallery: { name: first.name, version: 1 } },
          resource,
          users
        )
      ).rejects.toMatchObject({ code: ErrorCode.FileDeleteFailed });
    });

    test('runs the delete check of the policy on the version', async () => {
      const canDelete = jest.fn().mockResolvedValue(false);
      context.resource.policies.set('User', {
        modelName: 'User',
        files: { avatar: { accessType: 'public', canDelete } }
      } as any);
      await save('avatar', 'first');
      const second = await save('avatar', 'second');

      const error = await service
        .deleteVersions(
          { avatar: { name: second.name, version: 1 } },
          resource,
          users
        )
        .catch((e) => e);

      expect(error.details.errors[0]).toContain('forbidden');
      expect(canDelete).toHaveBeenCalledWith(
        null,
        resource,
        expect.objectContaining({ version: 1 })
      );
    });

    test('fails the delete of a version the storage keeps', async () => {
      await save('avatar', 'first');
      const second = await save('avatar', 'second');
      storage.delete.mockResolvedValueOnce(false);

      await expect(
        service.deleteVersions(
          { avatar: { name: second.name, version: 1 } },
          resource,
          users
        )
      ).rejects.toMatchObject({ code: ErrorCode.FileDeleteFailed });
    });

    test('fails the delete of a version on a database error', async () => {
      await save('avatar', 'first');
      const second = await save('avatar', 'second');
      files.delete.mockRejectedValueOnce(new Error('Database down'));

      await expect(
        service.deleteVersions(
          { avatar: { name: second.name, version: 1 } },
          resource,
          users
        )
      ).rejects.toMatchObject({ code: ErrorCode.FileDeleteFailed });
    });

    test('deleting a file deletes all its versions', async () => {
      await save('avatar', 'first');
      const second = await save('avatar', 'second');

      await service.deleteFiles({ avatar: second.name }, resource, users);

      expect(rows).toHaveLength(0);
      expect(stored.size).toBe(0);
    });

    test('logs the versions of a deleted file it cannot delete', async () => {
      await save('avatar', 'first');
      const second = await save('avatar', 'second');
      files.findMany.mockRejectedValueOnce(new Error('Database down'));

      await service.deleteFiles({ avatar: second.name }, resource, users);

      expect(rows).toHaveLength(1);
    });
  });
});
