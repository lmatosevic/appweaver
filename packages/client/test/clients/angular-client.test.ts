import { firstValueFrom } from 'rxjs';
import { AngularClient } from '../../clients/angular-client';

class TestClient extends AngularClient {
  public post = this.resourceClient<any>('/api/posts');
  public tag = this.resourceClient<any>('/api/tags', {
    query: 'get',
    aggregate: 'get'
  });
}

describe('angular-client', () => {
  /** Creates a client whose fetch handler records every outgoing request. */
  const createClient = () => {
    const requests: Request[] = [];
    const client = new TestClient(
      async (input) => {
        requests.push(input as Request);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      },
      { baseUrl: 'https://api.test' }
    );
    return { client, lastRequest: () => requests[requests.length - 1] };
  };

  describe('resourceClient', () => {
    test('returns observables from the resource operations', async () => {
      const { client, lastRequest } = createClient();

      const result = await firstValueFrom(client.post.query({}));

      expect(result).toEqual({ ok: true });
      expect(lastRequest().method).toBe('POST');
    });

    test('applies the configured query and aggregate methods', async () => {
      const { client, lastRequest } = createClient();

      await firstValueFrom(client.tag.query({ size: 5 }));
      expect(lastRequest().method).toBe('GET');
      expect(new URL(lastRequest().url).pathname).toBe('/api/tags/query');

      await firstValueFrom(client.tag.aggregate({ step: 2 }));
      expect(lastRequest().method).toBe('GET');
      expect(new URL(lastRequest().url).pathname).toBe('/api/tags/aggregate');
    });
  });
});
