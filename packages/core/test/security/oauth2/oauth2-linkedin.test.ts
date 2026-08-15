import { fetchLinkedinUser } from '../../../security/oauth2/oauth2-linkedin';
import { mockUserInfoResponse } from '../../fixtures/oauth2-fixture';

describe('fetchLinkedinUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should map the OpenID Connect claims', async () => {
    mockUserInfoResponse({
      sub: 'aBcDeF',
      email: 'ada@example.com',
      given_name: 'Ada',
      family_name: 'Lovelace',
      picture: 'https://media.licdn.com/avatar.jpg'
    });

    await expect(fetchLinkedinUser('token-value')).resolves.toEqual({
      id: 'aBcDeF',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatarUrl: 'https://media.licdn.com/avatar.jpg'
    });
  });

  test('should derive the name parts from the full name when they are missing', async () => {
    mockUserInfoResponse({
      sub: 'aBcDeF',
      email: 'ana@example.com',
      name: 'Ana Maria da Silva'
    });

    await expect(fetchLinkedinUser('token-value')).resolves.toMatchObject({
      firstName: 'Ana',
      lastName: 'Maria da Silva'
    });
  });

  test('should throw when the email scope was not granted', async () => {
    mockUserInfoResponse({ sub: 'aBcDeF', given_name: 'Ada' });

    await expect(fetchLinkedinUser('token-value')).rejects.toThrow(
      'LinkedIn account has no email address available'
    );
  });
});
