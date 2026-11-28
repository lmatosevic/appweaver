import { fetchFacebookUser } from '../../../security/oauth2/oauth2-facebook';
import { mockUserInfoResponse } from '../../fixtures/oauth2-fixture';

describe('fetchFacebookUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should map the profile, the email being a confirmed one', async () => {
    const fetchMock = mockUserInfoResponse({
      id: '2002',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      picture: { data: { url: 'https://graph.facebook.com/avatar.jpg' } }
    });

    await expect(fetchFacebookUser('token-value')).resolves.toMatchObject({
      id: '2002',
      email: 'ada@example.com',
      emailVerified: true,
      firstName: 'Ada',
      lastName: 'Lovelace'
    });
    expect(String(fetchMock.mock.calls[0][0] as string | URL)).toContain(
      'fields=id%2Cname%2Cemail'
    );
  });

  test('should throw when the account has no confirmed email', async () => {
    mockUserInfoResponse({ id: '2002', name: 'Ada Lovelace' });

    await expect(fetchFacebookUser('token-value')).rejects.toMatchObject({
      code: 'OAUTH2_EMAIL_UNAVAILABLE'
    });
  });
});
