import { ClientConfig } from '../../clients/base-client';
import { FetchClient } from '../../clients/fetch-client';
import { ClientError } from '../../errors';

class TestClient extends FetchClient {
  public auth = this.authClient<any>('/auth');
  public post = this.resourceClient<any>('/api/posts');
  public files = this.filesClient('/files');
}

describe('base-client', () => {
  const jsonResponse = (body: any, status: number = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });

  /** Creates a client whose fetch handler records every outgoing request. */
  const createClient = (config: Partial<ClientConfig> = {}) => {
    const requests: Request[] = [];
    const client = new TestClient({
      baseUrl: 'https://api.test',
      fetch: async (input) => {
        requests.push(input as Request);
        return jsonResponse({ ok: true });
      },
      ...config
    });
    return {
      client,
      requests,
      lastRequest: () => requests[requests.length - 1]
    };
  };

  describe('constructor', () => {
    test('prepends the base url to the request path', async () => {
      const { client, lastRequest } = createClient();

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().url).toBe('https://api.test/auth/me');
      expect(lastRequest().method).toBe('GET');
    });

    test('exposes the underlying client and the configuration', () => {
      const config: ClientConfig = {
        baseUrl: 'https://api.test',
        timeout: 100
      };
      const client = new TestClient(config);

      expect(client.getConfig()).toBe(config);
      expect(typeof client.getClient().request).toBe('function');
    });

    test('sends no authorization header without an auth config', async () => {
      const { client, lastRequest } = createClient();

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().headers.get('Authorization')).toBeNull();
      expect(lastRequest().headers.get('X-Api-Key')).toBeNull();
    });
  });

  describe('jwt authentication', () => {
    test('attaches a bearer token from a string', async () => {
      const { client, lastRequest } = createClient({
        auth: { jwt: 'token123' }
      });

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().headers.get('Authorization')).toBe(
        'Bearer token123'
      );
    });

    test('attaches the access token from a config object', async () => {
      const { client, lastRequest } = createClient({
        auth: { jwt: { accessToken: 'access', refreshToken: 'refresh' } }
      });

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().headers.get('Authorization')).toBe('Bearer access');
    });

    test('uses the refresh token for the auth refresh path', async () => {
      const { client, lastRequest } = createClient({
        auth: { jwt: { accessToken: 'access', refreshToken: 'refresh' } }
      });

      await client.auth.refresh();

      expect(lastRequest().headers.get('Authorization')).toBe('Bearer refresh');
    });

    test('keeps the access token on the refresh path without a refresh token', async () => {
      const { client, lastRequest } = createClient({
        auth: { jwt: { accessToken: 'access' } }
      });

      await client.auth.refresh();

      expect(lastRequest().headers.get('Authorization')).toBe('Bearer access');
    });

    test('resolves the token from a function', async () => {
      const resolver = jest.fn(async (_request: Request) => 'dynamic');
      const { client, lastRequest } = createClient({ auth: { jwt: resolver } });

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(resolver).toHaveBeenCalledTimes(1);
      expect(resolver.mock.calls[0][0]).toBeInstanceOf(Request);
      expect(lastRequest().headers.get('Authorization')).toBe('Bearer dynamic');
    });
  });

  describe('api key authentication', () => {
    test('uses the default header for a string key', async () => {
      const { client, lastRequest } = createClient({
        auth: { apiKey: 'secret-key' }
      });

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().headers.get('X-Api-Key')).toBe('secret-key');
    });

    test('supports a custom header name', async () => {
      const { client, lastRequest } = createClient({
        auth: { apiKey: { key: 'secret-key', header: 'X-Custom-Key' } }
      });

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().headers.get('X-Custom-Key')).toBe('secret-key');
      expect(lastRequest().headers.get('X-Api-Key')).toBeNull();
    });

    test('resolves the key from a function', async () => {
      const { client, lastRequest } = createClient({
        auth: { apiKey: async () => ({ key: 'from-fn' }) }
      });

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().headers.get('X-Api-Key')).toBe('from-fn');
    });
  });

  describe('basic authentication', () => {
    test('encodes the credentials from a config object', async () => {
      const { client, lastRequest } = createClient({
        auth: { basic: { username: 'admin', password: 'secret' } }
      });

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().headers.get('Authorization')).toBe(
        `Basic ${btoa('admin:secret')}`
      );
    });

    test('uses an already encoded string as is', async () => {
      const encoded = btoa('admin:secret');
      const { client, lastRequest } = createClient({
        auth: { basic: encoded }
      });

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().headers.get('Authorization')).toBe(
        `Basic ${encoded}`
      );
    });
  });

  describe('middlewares', () => {
    test('applies the configured middlewares', async () => {
      const { client, lastRequest } = createClient({
        middlewares: [
          {
            onRequest: async ({ request }) => {
              const headers = new Headers(request.headers);
              headers.set('X-Trace-Id', 'trace-1');
              return new Request(request, { headers });
            }
          }
        ]
      });

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().headers.get('X-Trace-Id')).toBe('trace-1');
    });
  });

  describe('timeout', () => {
    test('attaches an abort signal to the request', async () => {
      const { client, lastRequest } = createClient({ timeout: 1000 });

      await client.sendRequestPromise('get', '/auth/me', {});

      expect(lastRequest().signal).toBeDefined();
      expect(lastRequest().signal.aborted).toBe(false);
    });

    test('aborts a request that exceeds the timeout', async () => {
      const client = new TestClient({
        baseUrl: 'https://api.test',
        timeout: 20,
        fetch: (input) =>
          new Promise((_, reject) => {
            const { signal } = input as Request;
            signal.addEventListener('abort', () =>
              reject(new Error(signal.reason?.message ?? 'aborted'))
            );
          })
      });

      await expect(
        client.sendRequestPromise('get', '/auth/me', {})
      ).rejects.toThrow(/timed out|aborted/i);
    });
  });

  describe('sendRequestPromise', () => {
    test('returns the response data', async () => {
      const client = new TestClient({
        baseUrl: 'https://api.test',
        fetch: async () => jsonResponse({ id: 1, title: 'First' })
      });

      await expect(
        client.sendRequestPromise('get', '/api/posts/1', {})
      ).resolves.toEqual({
        id: 1,
        title: 'First'
      });
    });

    test('throws a ClientError built from the error response body', async () => {
      const client = new TestClient({
        baseUrl: 'https://api.test',
        fetch: async () =>
          jsonResponse({ message: 'Not found', errorCode: 404 }, 404)
      });

      await expect(
        client.sendRequestPromise('get', '/api/posts/1', {})
      ).rejects.toMatchObject({
        message: 'Not found',
        errorCode: 404
      });
      await expect(
        client.sendRequestPromise('get', '/api/posts/1', {})
      ).rejects.toBeInstanceOf(ClientError);
    });

    test('falls back to the response status when the body has no error code', async () => {
      const client = new TestClient({
        baseUrl: 'https://api.test',
        fetch: async () =>
          new Response(JSON.stringify({}), {
            status: 500,
            statusText: 'Internal Server Error',
            headers: { 'Content-Type': 'application/json' }
          })
      });

      await expect(
        client.sendRequestPromise('get', '/api/posts/1', {})
      ).rejects.toMatchObject({
        message: 'Internal Server Error',
        errorCode: 500
      });
    });
  });

  describe('sendRequestRawPromise', () => {
    test('returns the data, error and response without throwing', async () => {
      const client = new TestClient({
        baseUrl: 'https://api.test',
        fetch: async () => jsonResponse({ message: 'Forbidden' }, 403)
      });

      const result = await client.sendRequestRawPromise(
        'get',
        '/api/posts/1',
        {}
      );

      expect(result.data).toBeUndefined();
      expect(result.error).toEqual({ message: 'Forbidden' });
      expect(result.response.status).toBe(403);
    });
  });

  describe('module factories', () => {
    test('creates module clients bound to their base path', () => {
      const { client } = createClient();

      expect(client.auth.basePath).toBe('/auth');
      expect(client.post.basePath).toBe('/api/posts');
      expect(client.files.basePath).toBe('/files');
    });

    test('module clients send requests through the base client', async () => {
      const { client, lastRequest } = createClient();

      await client.post.find(5);

      expect(lastRequest().url).toBe('https://api.test/api/posts/5');
    });
  });
});
