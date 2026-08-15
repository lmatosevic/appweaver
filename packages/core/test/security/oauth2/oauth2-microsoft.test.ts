import { fetchMicrosoftUser } from '../../../security/oauth2/oauth2-microsoft';
import { mockUserInfoResponse } from '../../fixtures/oauth2-fixture';

describe('fetchMicrosoftUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should map a work account profile from Microsoft Graph', async () => {
    const fetchMock = mockUserInfoResponse({
      id: '9f4e-1234',
      displayName: 'Ada Lovelace',
      givenName: 'Ada',
      surname: 'Lovelace',
      mail: 'ada@contoso.com',
      userPrincipalName: 'ada@contoso.onmicrosoft.com'
    });

    await expect(fetchMicrosoftUser('token-value')).resolves.toEqual({
      id: '9f4e-1234',
      email: 'ada@contoso.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      // Avatar downloads stay disabled unless SECURITY_OAUTH2_FETCH_AVATAR_ENABLED is set.
      avatarFile: undefined
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://graph.microsoft.com/v1.0/me'
    );
  });

  test('should fall back to the principal name and the display name parts', async () => {
    mockUserInfoResponse({
      id: '9f4e-1234',
      displayName: 'Grace Brewster Hopper',
      userPrincipalName: 'grace@contoso.onmicrosoft.com'
    });

    await expect(fetchMicrosoftUser('token-value')).resolves.toMatchObject({
      email: 'grace@contoso.onmicrosoft.com',
      firstName: 'Grace',
      lastName: 'Brewster Hopper'
    });
  });

  test('should throw when the account exposes no address at all', async () => {
    mockUserInfoResponse({ id: '9f4e-1234', displayName: 'Ada Lovelace' });

    await expect(fetchMicrosoftUser('token-value')).rejects.toThrow(
      'Microsoft account has no email address available'
    );
  });
});
