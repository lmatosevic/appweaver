import { Application, createApp } from '@appweaver/core';
import { resetTestData } from './support/reset';

describe('Test Sample CMS API', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

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
