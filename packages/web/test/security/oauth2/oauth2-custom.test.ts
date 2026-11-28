import { AuthSource } from '@appweaver/common';
import { injectCreated } from '@appweaver/core';
import { fetchCustomUser } from '../../../security/oauth2/oauth2-custom';

jest.mock('@appweaver/core', () => ({
  ...jest.requireActual('@appweaver/core'),
  injectCreated: jest.fn()
}));

const injectCreatedMock = injectCreated as jest.Mock;

/** The server of the custom provider, its plugin answering the user info of the issuer. */
const serverWith = (claims: Record<string, unknown>) =>
  injectCreatedMock.mockReturnValue({
    instance: { [AuthSource.OAuth2Custom]: { userinfo: async () => claims } }
  });

describe('fetchCustomUser', () => {
  test('should map the OpenID Connect claims of the issuer', async () => {
    serverWith({
      sub: 'kc-1',
      email: 'ada@example.com',
      email_verified: true,
      given_name: 'Ada',
      family_name: 'Lovelace'
    });

    await expect(fetchCustomUser('token-value')).resolves.toEqual({
      id: 'kc-1',
      email: 'ada@example.com',
      emailVerified: true,
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatarUrl: undefined
    });
  });

  test('should report an address without the email_verified claim as unverified', async () => {
    serverWith({ sub: 'kc-1', email: 'ada@example.com' });

    await expect(fetchCustomUser('token-value')).resolves.toMatchObject({
      emailVerified: false
    });
  });

  test('should fail without the server', async () => {
    injectCreatedMock.mockReturnValue(undefined);

    await expect(fetchCustomUser('token-value')).rejects.toMatchObject({
      code: 'CONTEXT_SERVER_UNAVAILABLE'
    });
  });
});
