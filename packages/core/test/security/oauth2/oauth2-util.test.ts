import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HttpError } from '../../../errors';
import {
  decodeJwtPayload,
  fetchUserInfo,
  requireEmail,
  splitFullName
} from '../../../security/oauth2/oauth2-util';

type Oauth2Util = typeof import('../../../security/oauth2/oauth2-util');

const { privateKey: applePrivateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const originalEnv = { ...process.env };

/** Loads a fresh copy of the module with the given configuration applied to the environment. */
const loadUtil = async (env: Record<string, string>): Promise<Oauth2Util> => {
  Object.assign(process.env, env);
  jest.resetModules();

  return import('../../../security/oauth2/oauth2-util');
};

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
  jest.resetModules();
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

const decodeSegment = (segment: string) =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));

describe('fetchUserInfo', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should send the access token as a bearer credential', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ id: '42' }));

    const data = await fetchUserInfo<{ id: string }>(
      'Example',
      'https://example.com/me',
      'token-value',
      { accept: 'application/vnd.example+json' }
    );

    expect(data).toEqual({ id: '42' });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/me', {
      method: 'GET',
      headers: {
        authorization: 'Bearer token-value',
        accept: 'application/vnd.example+json'
      }
    });
  });

  test('should throw an HttpError when the provider responds with an error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ message: 'nope' }, 401));

    await expect(
      fetchUserInfo('Example', 'https://example.com/me', 'token-value')
    ).rejects.toThrow(HttpError);
  });
});

describe('fetchAuthenticatedAvatar', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnv();
  });

  test('should return undefined when avatar fetching is disabled', async () => {
    const { fetchAuthenticatedAvatar } = await loadUtil({
      SECURITY_OAUTH2_FETCH_AVATAR_ENABLED: 'false'
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(
      fetchAuthenticatedAvatar('https://example.com/photo', 'token-value', '42')
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('should download the avatar with the access token when enabled', async () => {
    const { fetchAuthenticatedAvatar } = await loadUtil({
      SECURITY_OAUTH2_FETCH_AVATAR_ENABLED: 'true'
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('image-bytes'), {
        status: 200,
        headers: { 'content-type': 'image/png' }
      })
    );

    await expect(
      fetchAuthenticatedAvatar('https://example.com/photo', 'token-value', '42')
    ).resolves.toEqual({
      name: 'avatar-42.png',
      mimeType: 'image/png',
      size: 11,
      data: Buffer.from('image-bytes')
    });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/photo', {
      method: 'GET',
      headers: { authorization: 'Bearer token-value' }
    });
  });

  test('should return undefined when the download fails', async () => {
    const { fetchAuthenticatedAvatar } = await loadUtil({
      SECURITY_OAUTH2_FETCH_AVATAR_ENABLED: 'true'
    });
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('connection reset'));

    await expect(
      fetchAuthenticatedAvatar('https://example.com/photo', 'token', '42')
    ).resolves.toBeUndefined();
  });
});

describe('splitFullName', () => {
  test('should split a two part name', () => {
    expect(splitFullName('Ada Lovelace')).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace'
    });
  });

  test('should keep multipart surnames intact', () => {
    expect(splitFullName('Ana Maria da Silva')).toEqual({
      firstName: 'Ana',
      lastName: 'Maria da Silva'
    });
  });

  test('should return empty parts for a missing name', () => {
    expect(splitFullName()).toEqual({ firstName: '', lastName: '' });
    expect(splitFullName('   ')).toEqual({ firstName: '', lastName: '' });
  });
});

describe('requireEmail', () => {
  test('should return the email address when present', () => {
    expect(requireEmail('Example', 'ada@example.com')).toBe('ada@example.com');
  });

  test('should throw a 403 when the provider returned no email', () => {
    expect(() => requireEmail('Example')).toThrow(
      'Example account has no email address available'
    );
  });
});

describe('decodeJwtPayload', () => {
  test('should decode the payload segment', () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: '001', email: 'ada@privaterelay.appleid.com' })
    ).toString('base64url');

    expect(decodeJwtPayload('Apple', `header.${payload}.signature`)).toEqual({
      sub: '001',
      email: 'ada@privaterelay.appleid.com'
    });
  });

  test('should throw when the token is missing', () => {
    expect(() => decodeJwtPayload('Apple')).toThrow(
      'Apple identity token is missing'
    );
  });

  test('should throw when the payload is not valid JSON', () => {
    const payload = Buffer.from('not-json').toString('base64url');

    expect(() => decodeJwtPayload('Apple', `header.${payload}.sig`)).toThrow(
      'Apple identity token is malformed'
    );
  });
});

describe('createAppleClientSecret', () => {
  const signingEnv = {
    SECURITY_OAUTH2_APPLE_CLIENT_ID: 'com.example.service',
    SECURITY_OAUTH2_APPLE_TEAM_ID: 'A1B2C3D4E5',
    SECURITY_OAUTH2_APPLE_KEY_ID: 'F6G7H8I9J0'
  };

  afterEach(restoreEnv);

  test('should use a literally configured client secret as-is', async () => {
    const { createAppleClientSecret } = await loadUtil({
      SECURITY_OAUTH2_APPLE_CLIENT_SECRET: 'preexisting.jwt'
    });

    expect(createAppleClientSecret()).toBe('preexisting.jwt');
  });

  test('should sign an ES256 token from the inline private key', async () => {
    const { createAppleClientSecret } = await loadUtil({
      ...signingEnv,
      // Environment variables cannot hold real newlines, so the key arrives escaped.
      SECURITY_OAUTH2_APPLE_PRIVATE_KEY: applePrivateKey.replace(/\n/g, '\\n')
    });

    const [header, payload, signature] = createAppleClientSecret().split('.');

    expect(decodeSegment(header)).toEqual({
      alg: 'ES256',
      kid: 'F6G7H8I9J0',
      typ: 'JWT'
    });

    const claims = decodeSegment(payload);
    expect(claims).toMatchObject({
      iss: 'A1B2C3D4E5',
      aud: 'https://appleid.apple.com',
      sub: 'com.example.service'
    });
    expect(claims.exp - claims.iat).toBe(15552000);

    // A JOSE ES256 signature is the raw 64 byte R||S pair, not a DER structure.
    expect(Buffer.from(signature, 'base64url')).toHaveLength(64);
  });

  test('should read the private key from the configured path', async () => {
    const keyPath = path.join(os.tmpdir(), `appweaver-apple-${Date.now()}.p8`);
    fs.writeFileSync(keyPath, applePrivateKey);

    try {
      const { createAppleClientSecret } = await loadUtil({
        ...signingEnv,
        SECURITY_OAUTH2_APPLE_PRIVATE_KEY_PATH: keyPath,
        SECURITY_OAUTH2_APPLE_CLIENT_SECRET_EXPIRES_IN: '3600'
      });

      const [, payload] = createAppleClientSecret().split('.');
      const claims = decodeSegment(payload);

      expect(claims.exp - claims.iat).toBe(3600);
    } finally {
      fs.rmSync(keyPath, { force: true });
    }
  });

  test('should throw when neither a secret nor a signing key is configured', async () => {
    const { createAppleClientSecret } = await loadUtil(signingEnv);

    expect(createAppleClientSecret).toThrow('Apple OAuth2 requires');
  });
});
