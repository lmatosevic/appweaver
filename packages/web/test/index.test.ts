import * as web from '../index';

describe('index', () => {
  test('exports the server, the routes and the config sections', () => {
    expect(web.HttpServer).toBeDefined();
    expect(web.createRoutes).toBeDefined();
    expect(web.registerRoute).toBeDefined();
    expect(web.serverConfig).toBeDefined();
    expect(web.securityConfig).toBeDefined();
  });
});
