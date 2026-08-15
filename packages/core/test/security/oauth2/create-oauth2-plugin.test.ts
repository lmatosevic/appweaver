import fastify from 'fastify';
import Wreck from '@hapi/wreck';
import { AuthSource, SecurityStore } from '@appweaver/common';
import { define } from '../../../context';
import { errorHandler } from '../../../errors';
import {
  ClientErrorResponse,
  ServerErrorResponse
} from '../../../errors/error-schema';
import { AuthService } from '../../../security/auth-service';
import {
  createOAuth2Plugin,
  OAuth2Config
} from '../../../security/oauth2/create-oauth2-plugin';
import { Server, UserInfo } from '../../../types';
import { resetContext } from '../../fixtures/context-fixture';

const REDIRECT_TO = 'https://app.example.com/login/handler';

const userInfo: UserInfo = {
  id: '42',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace'
};

const authUser = { id: 7, verifiedEmail: true };

let registerAuthUser: jest.Mock;
let findByUsername: jest.Mock;
let useOneTimeToken: jest.Mock;
let tokenRequest: jest.Mock;

/** Creates a bare fastify instance with the same schema setup as `createServer`. */
function createTestServer(): Server {
  const server = fastify({
    ajv: {
      customOptions: { removeAdditional: 'all', allowUnionTypes: true },
      plugins: [(ajv: any): any => ajv.addKeyword('example')]
    }
  }) as unknown as Server;

  server.addSchema(ClientErrorResponse);
  server.addSchema(ServerErrorResponse);
  server.setErrorHandler(errorHandler);

  return server;
}

/**
 * Registers the plugin on a bare fastify instance. Only the HTTP call to the provider's token endpoint is stubbed, so
 * the redirect, state handling and callback wiring all run for real.
 */
async function startServer(
  authSource: AuthSource,
  overrides: Partial<OAuth2Config> = {}
) {
  tokenRequest = jest.fn().mockResolvedValue({
    payload: {
      access_token: 'access-token-value',
      id_token: 'id.token.value',
      token_type: 'bearer'
    }
  });
  jest
    .spyOn(Wreck, 'defaults')
    .mockReturnValue({ post: tokenRequest } as unknown as typeof Wreck);

  const plugin = createOAuth2Plugin(authSource, {
    enabled: true,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    scope: ['email'],
    extractUserInfo: async () => userInfo,
    ...overrides
  });

  const server = createTestServer();
  await server.register(plugin);
  await server.ready();

  return server;
}

beforeEach(() => {
  resetContext();

  findByUsername = jest.fn().mockResolvedValue(authUser);
  registerAuthUser = jest.fn().mockResolvedValue(authUser);
  useOneTimeToken = jest.fn().mockResolvedValue({ redirectToUrl: REDIRECT_TO });

  define(
    {
      findByUsername,
      registerAuthUser,
      checkOAuth2User: jest.fn()
    },
    AuthService
  );
  define(
    {
      generateOneTimeToken: jest
        .fn()
        .mockImplementation(async (purpose: string) => `${purpose}-token`),
      useOneTimeToken
    },
    SecurityStore
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('createOAuth2Plugin', () => {
  test('should skip registration entirely when the provider is disabled', async () => {
    const server = createTestServer();
    await server.register(
      createOAuth2Plugin(AuthSource.OAuth2Google, {
        enabled: false,
        scope: [],
        extractUserInfo: async () => userInfo
      })
    );
    await server.ready();

    expect(server[AuthSource.OAuth2Google]).toBeUndefined();
    await server.close();
  });

  test('should fail to register when the client credentials are missing', async () => {
    const server = createTestServer();
    server.register(
      createOAuth2Plugin(AuthSource.OAuth2Google, {
        enabled: true,
        clientId: 'client-id',
        scope: [],
        extractUserInfo: async () => userInfo
      })
    );

    await expect(server.ready()).rejects.toThrow(
      'Google OAuth2 configuration is missing'
    );
  });

  test('should resolve a lazy client secret only once the provider is enabled', async () => {
    const clientSecret = jest.fn().mockReturnValue('generated-secret');

    const disabled = fastify() as unknown as Server;
    await disabled.register(
      createOAuth2Plugin(AuthSource.OAuth2Google, {
        enabled: false,
        clientId: 'client-id',
        clientSecret,
        scope: [],
        extractUserInfo: async () => userInfo
      })
    );
    await disabled.ready();
    expect(clientSecret).not.toHaveBeenCalled();
    await disabled.close();

    const server = await startServer(AuthSource.OAuth2Google, { clientSecret });
    expect(clientSecret).toHaveBeenCalledTimes(1);
    await server.close();
  });

  test('should redirect to the provider and exchange the callback for a one-time token', async () => {
    const server = await startServer(AuthSource.OAuth2Google);

    const redirect = await server.inject({
      method: 'GET',
      url: `/auth/login/google?redirectToUrl=${encodeURIComponent(REDIRECT_TO)}`
    });

    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toContain(
      'https://accounts.google.com/o/oauth2/v2/auth'
    );
    expect(redirect.headers.location).toContain('state=oauth2state-token');

    const callback = await server.inject({
      method: 'GET',
      url: '/auth/login/google/callback?code=auth-code&state=oauth2state-token'
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe(
      `${REDIRECT_TO}?token=authentication-token`
    );
    await server.close();
  });

  test('should reject a malformed redirect URL before contacting the provider', async () => {
    const server = await startServer(AuthSource.OAuth2Google);

    const response = await server.inject({
      method: 'GET',
      url: '/auth/login/google?redirectToUrl=not-a-url'
    });

    expect(response.statusCode).toBe(400);
    await server.close();
  });

  test('should add the PKCE challenge to the authorization request when enabled', async () => {
    const server = await startServer(AuthSource.OAuth2X, { pkce: 'S256' });

    const redirect = await server.inject({
      method: 'GET',
      url: `/auth/login/x?redirectToUrl=${encodeURIComponent(REDIRECT_TO)}`
    });

    expect(redirect.headers.location).toContain('code_challenge_method=S256');
    expect(redirect.headers.location).toContain('code_challenge=');
    expect(redirect.cookies.map((cookie: any) => cookie.name)).toContain(
      'oauth2-code-verifier'
    );
    await server.close();
  });

  test('should accept a form encoded callback when the provider posts it', async () => {
    const extractUserInfo = jest.fn().mockResolvedValue(userInfo);
    const server = await startServer(AuthSource.OAuth2Apple, {
      formPostCallback: true,
      extractUserInfo
    });

    const callback = await server.inject({
      method: 'POST',
      url: '/auth/login/apple/callback',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        code: 'auth-code',
        state: 'oauth2state-token',
        user: '{"name":{"firstName":"Ada"}}'
      }).toString()
    });

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe(
      `${REDIRECT_TO}?token=authentication-token`
    );

    // Both the state and the code have to be read out of the form body.
    expect(useOneTimeToken).toHaveBeenCalledWith(
      'oauth2state-token',
      'oauth2state'
    );
    expect(tokenRequest.mock.calls[0][1].payload).toContain('code=auth-code');

    // The provider's response has to reach the extractor as the request body.
    const [accessToken, context] = extractUserInfo.mock.calls[0];
    expect(accessToken).toBe('access-token-value');
    expect(context.token.id_token).toBe('id.token.value');
    expect(context.request.body).toMatchObject({
      user: '{"name":{"firstName":"Ada"}}'
    });
    await server.close();
  });

  test('should register a new user with the avatar the provider already downloaded', async () => {
    findByUsername.mockResolvedValue(null);

    const avatarFile = {
      name: 'avatar-42.png',
      mimeType: 'image/png',
      size: 3,
      data: Buffer.from('png')
    };
    const server = await startServer(AuthSource.OAuth2Microsoft, {
      extractUserInfo: async () => ({ ...userInfo, avatarFile })
    });

    const callback = await server.inject({
      method: 'GET',
      url: '/auth/login/microsoft/callback?code=auth-code&state=oauth2state-token'
    });

    expect(callback.statusCode).toBe(302);
    expect(registerAuthUser).toHaveBeenCalledWith(
      AuthSource.OAuth2Microsoft,
      'ada@example.com',
      undefined,
      expect.objectContaining({ avatarFile })
    );
    await server.close();
  });

  test('should reject an existing user whose email is not verified', async () => {
    findByUsername.mockResolvedValue({ id: 7, verifiedEmail: false });
    const server = await startServer(AuthSource.OAuth2Google);

    const callback = await server.inject({
      method: 'GET',
      url: '/auth/login/google/callback?code=auth-code&state=oauth2state-token'
    });

    expect(callback.statusCode).toBe(403);
    await server.close();
  });
});
