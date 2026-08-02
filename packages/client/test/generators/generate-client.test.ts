import { generateClient } from '../../generators/generate-client';
import { createOpenApiSchema } from '../fixtures/openapi-schema';

describe('generate-client', () => {
  describe('generateClient', () => {
    let client: string;

    beforeAll(async () => {
      client = await generateClient(createOpenApiSchema());
    });

    test('derives the class name from the schema title', () => {
      expect(client).toContain('export class CMSAPIClient extends FetchClient');
      expect(client).toContain(
        'export function createClient(config: ClientConfig): CMSAPIClient'
      );
    });

    test('falls back to WeaverClient when the title is empty', async () => {
      const schema = createOpenApiSchema();
      schema.info.title = '';
      const generated = await generateClient(schema);
      expect(generated).toContain('export class WeaverClient');
    });

    test('camel cases a multi word title', async () => {
      const schema = createOpenApiSchema();
      schema.info.title = 'my-blog api';
      const generated = await generateClient(schema);
      expect(generated).toContain('export class MyBlogApiClient');
    });

    test('sanitizes an explicitly provided client name', async () => {
      const generated = await generateClient(
        createOpenApiSchema(),
        'My Custom-Client!'
      );
      expect(generated).toContain('export class MyCustomClient');
    });

    test('adds an auth client with the configured prefix', () => {
      expect(client).toContain(
        `this.authClient<AuthModuleType, ['refresh', 'changePassword', 'exchangeToken']>('/auth')`
      );
      expect(client).toContain('public auth =');
    });

    test('adds an account client omitting the unused operations', () => {
      expect(client).toContain('public account =');
      expect(client).toContain(`this.accountClient<AccountModuleType,`);
      expect(client).toContain(`'sendVerifyEmail'`);
      expect(client).toContain(`>('/auth/account')`);
    });

    test('adds a health client omitting the unused operations', () => {
      expect(client).toContain(
        `public health = this.healthClient<HealthModuleType, ['ready']>('/health')`
      );
    });

    test('adds a files client without a module type', () => {
      expect(client).toContain(
        `public files = this.filesClient<['protected']>('/files')`
      );
    });

    test('adds a resource client for every resource path', () => {
      expect(client).toContain(
        `public post = this.resourceClient<PostResourceModuleType, ['aggregate', 'export', 'deleteFiles']>('/api/posts')`
      );
      expect(client).toContain(`public user = this.resourceClient<`);
      expect(client).toContain(`>('/api/users')`);
    });

    test('omits every unused resource operation', () => {
      const userLine = client
        .split('\n')
        .find((line) => line.includes('public user ='))!;
      expect(userLine).toContain(`'query'`);
      expect(userLine).toContain(`'delete'`);
      expect(userLine).not.toContain(`'find'`);
    });

    test('adds custom requests for unrecognized routes', () => {
      expect(client).toContain(
        `public info = this.customRequest('get', '/api/')`
      );
      expect(client).toContain(
        `public postApiPublishPosts = this.customRequest('post', '/api/publish-posts')`
      );
    });

    test('skips OAuth2 login provider routes', () => {
      expect(client).not.toContain('/auth/login/google');
    });

    test('skips resources without a configured base path', async () => {
      const schema = createOpenApiSchema();
      (schema as any)['x-appweaver-config'].resourcePaths = [
        { name: 'Post', basePath: '/posts' }
      ];
      const generated = await generateClient(schema);
      expect(generated).toContain('public post =');
      expect(generated).not.toContain('public user =');
    });

    test('imports the types module when a types path is given', async () => {
      const generated = await generateClient(
        createOpenApiSchema(),
        undefined,
        'fetch',
        './schema'
      );
      expect(generated).toContain(`import * as Type from './schema';`);
      expect(generated).toContain('extends FetchClient<Type.paths>');
      expect(generated).toContain('this.authClient<Type.AuthModuleType');
    });

    test('generates a client without generic types when noTypes is set', async () => {
      const generated = await generateClient(
        createOpenApiSchema(),
        undefined,
        'fetch',
        './schema',
        true
      );
      expect(generated).not.toContain('import * as Type');
      expect(generated).toContain(
        'export class CMSAPIClient extends FetchClient {'
      );
      expect(generated).toContain(`public auth = this.authClient('/auth')`);
      expect(generated).toContain(
        `public post = this.resourceClient('/api/posts')`
      );
    });

    test('generates an Angular client', async () => {
      const generated = await generateClient(
        createOpenApiSchema(),
        undefined,
        'angular'
      );
      expect(generated).toContain(
        `import { AngularClient } from '@appweaver/client/angular';`
      );
      expect(generated).toContain(
        `import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';`
      );
      expect(generated).toContain(
        'export class CMSAPIClient extends AngularClient'
      );
      expect(generated).toContain(
        'constructor(http: HttpClient, config: ClientConfig)'
      );
      expect(generated).toContain('public auth =');
      expect(generated).not.toContain('export function createClient');
    });

    test('accepts the schema as a JSON string', async () => {
      const generated = await generateClient(
        JSON.stringify(createOpenApiSchema())
      );
      expect(generated).toBe(client);
    });

    test('ignores path item references', async () => {
      const schema = createOpenApiSchema();
      (schema.paths as any)['/api/referenced'] = {
        $ref: '#/components/pathItems/referenced'
      };
      const generated = await generateClient(schema);
      expect(generated).not.toContain('/api/referenced');
    });

    test('exports the ClientError type', () => {
      expect(client).toContain('export { ClientError };');
    });
  });
});
