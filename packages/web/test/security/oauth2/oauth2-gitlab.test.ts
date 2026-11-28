import { fetchGitlabUser } from '../../../security/oauth2/oauth2-gitlab';
import { mockUserInfoResponse } from '../../fixtures/oauth2-fixture';

describe('fetchGitlabUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should map the profile returned by the users endpoint', async () => {
    mockUserInfoResponse({
      id: 7,
      username: 'ada',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      confirmed_at: '2026-01-05T09:00:00Z',
      avatar_url: 'https://gitlab.com/uploads/avatar.png'
    });

    await expect(fetchGitlabUser('token-value')).resolves.toEqual({
      id: '7',
      email: 'ada@example.com',
      emailVerified: true,
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatarUrl: 'https://gitlab.com/uploads/avatar.png'
    });
  });

  test('should fall back to the username when no display name is set', async () => {
    mockUserInfoResponse({ id: 7, username: 'ada', email: 'ada@example.com' });

    await expect(fetchGitlabUser('token-value')).resolves.toMatchObject({
      firstName: 'ada',
      lastName: ''
    });
  });

  test('should report an address the account never confirmed as unverified', async () => {
    mockUserInfoResponse({
      id: 7,
      username: 'ada',
      email: 'ada@example.com',
      confirmed_at: null
    });

    await expect(fetchGitlabUser('token-value')).resolves.toMatchObject({
      emailVerified: false
    });
  });

  test('should throw when the account exposes no email address', async () => {
    mockUserInfoResponse({ id: 7, username: 'ada' });

    await expect(fetchGitlabUser('token-value')).rejects.toThrow(
      'GitLab account has no email address available'
    );
  });
});
