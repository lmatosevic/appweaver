import { fetchMicrosoftUser } from '../../../security/oauth2/oauth2-microsoft';
import {
  jsonResponse,
  mockUserInfoResponse
} from '../../fixtures/oauth2-fixture';

describe('fetchMicrosoftUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should map a work account profile from Microsoft Graph', async () => {
    // Graph serves the profile first and the photo as authenticated binary content on a second request
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          id: '9f4e-1234',
          displayName: 'Ada Lovelace',
          givenName: 'Ada',
          surname: 'Lovelace',
          mail: 'ada@contoso.com',
          userPrincipalName: 'ada@contoso.onmicrosoft.com'
        })
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from('image-bytes'), {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
      );

    await expect(fetchMicrosoftUser('token-value')).resolves.toEqual({
      id: '9f4e-1234',
      email: 'ada@contoso.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatarFile: {
        name: 'avatar-9f4e-1234.png',
        mimeType: 'image/png',
        size: 11,
        data: Buffer.from('image-bytes')
      }
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://graph.microsoft.com/v1.0/me'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://graph.microsoft.com/v1.0/me/photo/$value'
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
