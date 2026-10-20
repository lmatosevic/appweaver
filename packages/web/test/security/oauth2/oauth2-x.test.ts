import { fetchXUser } from '../../../security/oauth2/oauth2-x';
import { mockUserInfoResponse } from '../../fixtures/oauth2-fixture';

describe('fetchXUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should map the profile and request the largest avatar variant', async () => {
    const fetchMock = mockUserInfoResponse({
      data: {
        id: '1234567890',
        name: 'Ada Lovelace',
        username: 'ada',
        confirmed_email: 'ada@gmail.com',
        profile_image_url: 'https://pbs.twimg.com/pic_normal.jpg'
      }
    });

    await expect(fetchXUser('token-value')).resolves.toEqual({
      id: '1234567890',
      email: 'ada@gmail.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatarUrl: 'https://pbs.twimg.com/pic_400x400.jpg'
    });

    // The email field has to be asked for explicitly, it is not part of the default user object.
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.x.com/2/users/me?user.fields=name%2Cusername%2Cprofile_image_url%2Cconfirmed_email'
    );
  });

  test('should still resolve a user without an avatar', async () => {
    mockUserInfoResponse({
      data: {
        id: '1',
        name: 'Grace',
        username: 'grace',
        confirmed_email: 'g@x.io'
      }
    });

    await expect(fetchXUser('token-value')).resolves.toMatchObject({
      email: 'g@x.io',
      firstName: 'Grace',
      lastName: '',
      avatarUrl: undefined
    });
  });

  test('should reject the login when X returns no email address', async () => {
    mockUserInfoResponse({
      data: { id: '1', name: 'Grace Hopper', username: 'grace' }
    });

    await expect(fetchXUser('token-value')).rejects.toThrow(
      'X did not return an email address'
    );
  });
});
