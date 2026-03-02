import { Application, createApp } from '@appweaver/core';

describe('Test Sample CMS API', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createApp({ autoStart: false });
  });

  afterAll(async () => {
    await app.stop();
  });

  test('Info endpoint /api', async () => {
    const resp = await app.server.inject({
      method: 'GET',
      url: '/api'
    });
    expect(resp.json()).toEqual({
      name: 'CMS API',
      version: '1.0.0'
    });
  });
});
