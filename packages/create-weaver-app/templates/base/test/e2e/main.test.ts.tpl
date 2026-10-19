import { Application, createApp } from '@appweaver/core';
import { resetTestData } from './support/reset';

describe('Sample e2e test', () => {
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
      name: '{{NAME}}',
      version: '1.0.0'
    });
  });
});
