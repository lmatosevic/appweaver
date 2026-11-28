import { fetchGoogleUser } from '../../../security/oauth2/oauth2-google';
import { mockUserInfoResponse } from '../../fixtures/oauth2-fixture';

describe('fetchGoogleUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should map the profile of the v2 user info endpoint', async () => {
    mockUserInfoResponse({
      id: '1001',
      email: 'ada@gmail.com',
      verified_email: true,
      given_name: 'Ada',
      family_name: 'Lovelace',
      picture: 'https://lh3.googleusercontent.com/a/photo'
    });

    await expect(fetchGoogleUser('token-value')).resolves.toEqual({
      id: '1001',
      email: 'ada@gmail.com',
      emailVerified: true,
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatarUrl: 'https://lh3.googleusercontent.com/a/photo'
    });
  });

  test('should read the email_verified claim of the OpenID Connect endpoint', async () => {
    mockUserInfoResponse({
      id: '1001',
      email: 'ada@gmail.com',
      email_verified: true
    });

    await expect(fetchGoogleUser('token-value')).resolves.toMatchObject({
      emailVerified: true,
      firstName: '',
      lastName: ''
    });
  });

  test('should report an address Google did not verify as unverified', async () => {
    mockUserInfoResponse({
      id: '1001',
      email: 'ada@example.com',
      verified_email: false
    });

    await expect(fetchGoogleUser('token-value')).resolves.toMatchObject({
      emailVerified: false
    });
  });
});
