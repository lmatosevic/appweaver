import { FastifyRequest } from 'fastify';
import { extractAppleUser } from '../../../security/oauth2/oauth2-apple';
import { OAuth2TokenSet } from '../../../types';

const idToken = (claims: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;

const context = (claims: Record<string, unknown>, body: unknown = {}) => ({
  token: {
    access_token: 'token-value',
    id_token: idToken(claims)
  } as OAuth2TokenSet,
  request: { body } as FastifyRequest
});

describe('extractAppleUser', () => {
  test('should read the identity from the id token and the name from the form body', async () => {
    await expect(
      extractAppleUser(
        context(
          { sub: '000123.abc.0001', email: 'ada@privaterelay.appleid.com' },
          { user: '{"name":{"firstName":"Ada","lastName":"Lovelace"}}' }
        )
      )
    ).resolves.toEqual({
      id: '000123.abc.0001',
      email: 'ada@privaterelay.appleid.com',
      firstName: 'Ada',
      lastName: 'Lovelace'
    });
  });

  test('should return empty name parts on subsequent authorizations', async () => {
    await expect(
      extractAppleUser(
        context({ sub: '000123.abc.0001', email: 'ada@example.com' })
      )
    ).resolves.toEqual({
      id: '000123.abc.0001',
      email: 'ada@example.com',
      firstName: '',
      lastName: ''
    });
  });

  test('should ignore a malformed user payload', async () => {
    await expect(
      extractAppleUser(
        context({ sub: '1', email: 'ada@example.com' }, { user: 'not-json' })
      )
    ).resolves.toMatchObject({ firstName: '', lastName: '' });
  });

  test('should throw when the identity token carries no email', async () => {
    await expect(extractAppleUser(context({ sub: '1' }))).rejects.toThrow(
      'Apple account has no email address available'
    );
  });

  test('should throw when the token response has no identity token', async () => {
    await expect(
      extractAppleUser({
        token: { access_token: 'token-value' },
        request: { body: {} } as FastifyRequest
      })
    ).rejects.toThrow('Apple identity token is missing');
  });
});
