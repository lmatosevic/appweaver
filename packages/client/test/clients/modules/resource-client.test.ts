import { ResourceClient } from '../../../clients/modules/resource-client';
import { ClientError } from '../../../errors';
import { createStubClient } from '../../fixtures/stub-client';

type TestResource = any;

describe('resource-client', () => {
  const basePath = '/api/posts';

  const createResource = (result?: Parameters<typeof createStubClient>[0]) => {
    const stub = createStubClient(result);
    return {
      stub,
      resource: new ResourceClient<TestResource>(stub.client, basePath)
    };
  };

  describe('find', () => {
    test('requests a single record by id', async () => {
      const { stub, resource } = createResource({ data: { id: 7 } });

      await expect(resource.find(7)).resolves.toEqual({ id: 7 });
      expect(stub.lastCall()).toMatchObject({
        method: 'get',
        path: '/api/posts/{id}'
      });
      expect(stub.lastCall().params.params.path).toEqual({ id: 7 });
    });

    test('keeps additional request options and params', async () => {
      const { stub, resource } = createResource();

      await resource.find(7, {
        params: { query: { include: 'author' } },
        headers: { 'x-test': '1' }
      });

      expect(stub.lastCall().params.params).toEqual({
        query: { include: 'author' },
        path: { id: 7 }
      });
      expect(stub.lastCall().params.headers).toEqual({ 'x-test': '1' });
    });
  });

  describe('query', () => {
    test('posts the query request to the query path', async () => {
      const { stub, resource } = createResource({ data: { items: [] } });

      await resource.query({ page: 1, size: 10 });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/api/posts/query'
      });
      expect(stub.lastCall().params.body).toEqual({ page: 1, size: 10 });
    });
  });

  describe('aggregate', () => {
    test('posts the aggregation request to the aggregate path', async () => {
      const { stub, resource } = createResource();

      await resource.aggregate({ count: true });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/api/posts/aggregate'
      });
      expect(stub.lastCall().params.body).toEqual({ count: true });
    });
  });

  describe('create', () => {
    test('posts the record to the base path', async () => {
      const { stub, resource } = createResource();

      await resource.create({ title: 'First' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/api/posts'
      });
      expect(stub.lastCall().params.body).toEqual({ title: 'First' });
    });
  });

  describe('update', () => {
    test('puts the record and takes the id from the payload', async () => {
      const { stub, resource } = createResource();

      await resource.update({ id: 3, title: 'Updated' });

      expect(stub.lastCall()).toMatchObject({
        method: 'put',
        path: '/api/posts/{id}'
      });
      expect(stub.lastCall().params.params.path).toEqual({ id: 3 });
      expect(stub.lastCall().params.body).toEqual({ id: 3, title: 'Updated' });
    });
  });

  describe('delete', () => {
    test('deletes the record by id', async () => {
      const { stub, resource } = createResource();

      await resource.delete(9);

      expect(stub.lastCall()).toMatchObject({
        method: 'delete',
        path: '/api/posts/{id}'
      });
      expect(stub.lastCall().params.params.path).toEqual({ id: 9 });
    });
  });

  describe('export', () => {
    test('requests the export as a stream and returns a file response', async () => {
      const response = new Response('id,title\n1,First', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Length': '16',
          'Content-Disposition': 'attachment; filename="posts.csv"'
        }
      });
      const { stub, resource } = createResource({ response });

      const file = await resource.export({ format: 'csv' });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/api/posts/export'
      });
      expect(stub.lastCall().params.parseAs).toBe('stream');
      expect(file.fileName).toBe('posts.csv');
      expect(file.type).toBe('text/csv');
      await expect(file.text()).resolves.toBe('id,title\n1,First');
    });

    test('throws a ClientError when the export fails', async () => {
      const { resource } = createResource({
        error: { message: 'Export failed', errorCode: 422 },
        response: new Response(null, { status: 422 })
      });

      await expect(resource.export({})).rejects.toThrow(ClientError);
      await expect(resource.export({})).rejects.toThrow('Export failed');
    });
  });

  describe('uploadFiles', () => {
    test('sends a single file as multipart form data', async () => {
      const { stub, resource } = createResource();
      const image = new File(['data'], 'image.png', { type: 'image/png' });

      await resource.uploadFiles(4, { image });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/api/posts/{id}/files'
      });
      expect(stub.lastCall().params.params.path).toEqual({ id: 4 });

      const formData = stub.lastCall().params.body as FormData;
      expect(formData).toBeInstanceOf(FormData);
      expect((formData.get('image') as File).name).toBe('image.png');
    });

    test('appends every file of an array field', async () => {
      const { stub, resource } = createResource();
      const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];

      await resource.uploadFiles(4, { attachments: files });

      const formData = stub.lastCall().params.body as FormData;
      const uploaded = formData.getAll('attachments') as File[];
      expect(uploaded).toHaveLength(2);
      expect(uploaded.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
    });
  });

  describe('deleteFiles', () => {
    test('posts the file deletion payload', async () => {
      const { stub, resource } = createResource();

      await resource.deleteFiles(4, { image: true });

      expect(stub.lastCall()).toMatchObject({
        method: 'post',
        path: '/api/posts/{id}/delete-files'
      });
      expect(stub.lastCall().params.params.path).toEqual({ id: 4 });
      expect(stub.lastCall().params.body).toEqual({ image: true });
    });
  });
});
