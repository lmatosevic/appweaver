import { Application, createApp, injectService } from '@appweaver/core';
import { resetTestData } from './support/reset';

/**
 * Rows the framework attaches to an authenticated user hold a required foreign
 * key back to it, so without a cascade the database refuses to delete any user
 * that ever signed in through OAuth2 or owned an API key.
 */
describe('Deleting a user with framework owned relations', () => {
  let app: Application;
  let users: any;
  let connectedAccounts: any;
  let apiKeys: any;

  const createUser = async (email: string) =>
    users.create({
      firstName: 'Cascade',
      lastName: 'Delete',
      email,
      phone: '+38512345678',
      password: 'Casc4de!Pass'
    });

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    users = injectService('User');
    connectedAccounts = injectService('ConnectedAccount');
    apiKeys = injectService('ApiKey');
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('removes the connected accounts of a deleted user', async () => {
    const user = await createUser('cascade-connected@example.com');
    const account = await connectedAccounts.client.create({
      data: {
        provider: 'google',
        providerAccountId: 'google-account-id',
        lastLoginAt: new Date(),
        userId: user.id
      }
    });

    await users.delete(user.id);

    const remaining = await connectedAccounts.client.findFirst({
      where: { id: account.id }
    });
    expect(remaining).toBeNull();
  });

  test('removes the api keys of a deleted user', async () => {
    const user = await createUser('cascade-api-key@example.com');
    const apiKey = await apiKeys.client.create({
      data: {
        key: 'cascade-key',
        keyHash: 'cascade-key-hash',
        userId: user.id
      }
    });

    await users.delete(user.id);

    const remaining = await apiKeys.client.findFirst({
      where: { id: apiKey.id }
    });
    expect(remaining).toBeNull();
  });
});
