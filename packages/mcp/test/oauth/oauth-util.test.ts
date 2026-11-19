import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configOverrides } from '@appweaver/common';
import {
  authorizationServerMetadata,
  createClientId,
  isAllowedRedirectUri,
  readClientId,
  resourceMetadata,
  resourceMetadataUrl,
  verifyCodeChallenge
} from '../../oauth/oauth-util';

const client = {
  redirectUris: ['http://localhost:3333/callback'],
  issuedAt: 1,
  name: 'Agent'
};

describe('oauth-util', () => {
  beforeEach(() => {
    configOverrides.APP_HOSTNAME = 'https://api.test/';
    configOverrides.SECURITY_JWT_SECRET = 'secret';
  });

  afterEach(() => {
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('resourceMetadata', () => {
    test('describes the MCP endpoint and its authorization server', () => {
      configOverrides.MCP_ROUTE_PREFIX = '/api/mcp/';
      configOverrides.MCP_SERVER_NAME = 'Blog';

      expect(resourceMetadata()).toEqual({
        resource: 'https://api.test/api/mcp',
        authorization_servers: ['https://api.test'],
        bearer_methods_supported: ['header'],
        resource_name: 'Blog'
      });
      expect(resourceMetadataUrl()).toBe(
        'https://api.test/.well-known/oauth-protected-resource/api/mcp'
      );
    });
  });

  describe('authorizationServerMetadata', () => {
    test('lists the endpoints under the route prefix', () => {
      configOverrides.MCP_OAUTH2_ROUTE_PREFIX = 'mcp-oauth';

      expect(authorizationServerMetadata()).toMatchObject({
        issuer: 'https://api.test',
        authorization_endpoint: 'https://api.test/mcp-oauth/authorize',
        token_endpoint: 'https://api.test/mcp-oauth/token',
        registration_endpoint: 'https://api.test/mcp-oauth/register',
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none']
      });
    });
  });

  describe('isAllowedRedirectUri', () => {
    test('allows HTTPS and the HTTP of the loopback interface', () => {
      expect(isAllowedRedirectUri('https://agent.test/callback')).toBe(true);
      expect(isAllowedRedirectUri('http://localhost:3333/cb')).toBe(true);
      expect(isAllowedRedirectUri('http://127.0.0.1/cb')).toBe(true);
      expect(isAllowedRedirectUri('http://[::1]:80/cb')).toBe(true);
      expect(isAllowedRedirectUri('http://agent.test/cb')).toBe(false);
      expect(isAllowedRedirectUri('https://agent.test/cb#x')).toBe(false);
      expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
      expect(isAllowedRedirectUri('not a url')).toBe(false);
    });
  });

  describe('createClientId', () => {
    test('signs a client its ID is read back from', async () => {
      const clientId = await createClientId(client);

      await expect(readClientId(clientId)).resolves.toEqual(client);
    });

    test('reads no tampered, foreign or malformed ID', async () => {
      const clientId = await createClientId(client);
      const [payload, signature] = clientId.split('.');
      const forged = Buffer.from(
        JSON.stringify({ r: ['https://evil.test'], t: 1 })
      ).toString('base64url');

      await expect(readClientId(`mcp_${forged}.${signature}`)).resolves.toBe(
        undefined
      );
      await expect(readClientId(`${payload}.x`)).resolves.toBeUndefined();
      await expect(readClientId('other')).resolves.toBeUndefined();
      await expect(readClientId(42)).resolves.toBeUndefined();

      configOverrides.SECURITY_JWT_SECRET = 'other';
      await expect(readClientId(clientId)).resolves.toBeUndefined();
    });

    test('signs with the private key of the JWTs without a secret', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-oauth-'));
      const keyPath = path.join(dir, 'private.key');
      fs.writeFileSync(keyPath, 'key');
      delete configOverrides.SECURITY_JWT_SECRET;
      configOverrides.SECURITY_JWT_PRIVATE_KEY_PATH = keyPath;

      const clientId = await createClientId(client);
      await expect(readClientId(clientId)).resolves.toEqual(client);

      configOverrides.SECURITY_JWT_SECRET = 'secret';
      await expect(readClientId(clientId)).resolves.toBeUndefined();
      fs.rmSync(dir, { recursive: true });
    });
  });

  describe('verifyCodeChallenge', () => {
    test('checks the S256 challenge of a verifier', () => {
      const verifier = 'a'.repeat(43);
      const challenge = createHash('sha256')
        .update(verifier)
        .digest('base64url');

      expect(verifyCodeChallenge(verifier, challenge)).toBe(true);
      expect(verifyCodeChallenge('b'.repeat(43), challenge)).toBe(false);
      expect(verifyCodeChallenge('short', challenge)).toBe(false);
      expect(verifyCodeChallenge(undefined, challenge)).toBe(false);
      expect(verifyCodeChallenge(verifier, 'x')).toBe(false);
    });
  });
});
