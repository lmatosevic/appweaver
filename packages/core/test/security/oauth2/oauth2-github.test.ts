import { fetchGithubUser } from '../../../security/oauth2/oauth2-github';
import { mockUserInfoResponse } from '../../fixtures/oauth2-fixture';

describe('fetchGithubUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should map a profile that exposes its email address', async () => {
    const fetchMock = mockUserInfoResponse({
      id: 42,
      login: 'ada',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/42'
    });

    await expect(fetchGithubUser('token-value')).resolves.toEqual({
      id: '42',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatarUrl: 'https://avatars.githubusercontent.com/u/42'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('should fall back to the primary verified address when the email is private', async () => {
    const fetchMock = mockUserInfoResponse({ id: 42, login: 'ada' }, [
      { email: 'old@example.com', primary: false, verified: true },
      { email: 'ada@example.com', primary: true, verified: true }
    ]);

    await expect(fetchGithubUser('token-value')).resolves.toMatchObject({
      email: 'ada@example.com',
      firstName: 'ada',
      lastName: ''
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.github.com/user/emails'
    );
  });

  test('should ignore unverified addresses', async () => {
    mockUserInfoResponse({ id: 42, login: 'ada' }, [
      { email: 'unverified@example.com', primary: true, verified: false },
      { email: 'verified@example.com', primary: false, verified: true }
    ]);

    await expect(fetchGithubUser('token-value')).resolves.toMatchObject({
      email: 'verified@example.com'
    });
  });

  test('should throw when no verified address exists', async () => {
    mockUserInfoResponse({ id: 42, login: 'ada' }, [
      { email: 'unverified@example.com', primary: true, verified: false }
    ]);

    await expect(fetchGithubUser('token-value')).rejects.toThrow(
      'GitHub account has no verified email address'
    );
  });
});
