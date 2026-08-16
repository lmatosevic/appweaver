import { AuthSource, Database, Storage } from '@appweaver/common';
import {
  Application,
  AuthService,
  createApp,
  inject,
  injectService
} from '@appweaver/core';
import { resetTestData } from './support/reset';

/**
 * Exercises the `registrationFiles` hook of the user service against the real
 * database and file storage: an avatar handed to the registration, as an OAuth2
 * provider avatar is, ends up stored and linked to the file field of the user
 * that was created for it.
 */
describe('Registration files', () => {
  let app: Application;
  let users: any;

  // A 4x4 PNG, resized to 480x480 by the image processing of the avatar field
  const avatarData = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWM4IScHRwzEcQCxYxBB16puEAAAAABJRU5ErkJggg==',
    'base64'
  );

  const avatarFile = {
    name: 'profile.png',
    mimeType: 'image/png',
    size: avatarData.length,
    data: avatarData
  };

  const register = async (email: string, data: Record<string, any> = {}) =>
    inject(AuthService).registerAuthUser(
      AuthSource.OAuth2Google,
      email,
      undefined,
      { firstName: 'Ava', lastName: 'Tar', ...data }
    );

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    users = injectService('User');

    // The registration data of the sample connects the role with id 1
    await inject<any>(Database)
      .client()
      .role.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, name: 'RegistrationUser' }
      });
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('stores the avatar and links it to the registered user', async () => {
    const user = await register('avatar-registration@example.com', {
      avatarFile
    });

    const stored = await users.client.findFirst({
      where: { id: user.id },
      include: { avatar: true }
    });

    expect(stored.avatar).toMatchObject({
      originalName: 'profile.png',
      mimeType: 'image/png',
      resourceName: 'User',
      resourceField: 'avatar',
      resourceId: String(user.id)
    });

    // Named after the pattern configured on the avatar field of the model
    expect(stored.avatar.name).toMatch(/^avatars\/profile-.+\.png$/);
    expect(stored.avatar.checksum).toEqual(expect.any(String));

    // The size of the file in storage, which is the resized image and not the
    // smaller source it was processed from
    const content = await inject(Storage).stream(stored.avatar.name);
    expect(stored.avatar.sizeBytes).toBe(content?.size);
    expect(stored.avatar.sizeBytes).toBeGreaterThan(avatarData.length);
    content?.stream.destroy();
  });

  test('registers the user without an avatar when none is provided', async () => {
    const user = await register('no-avatar-registration@example.com');

    const stored = await users.client.findFirst({
      where: { id: user.id },
      include: { avatar: true }
    });

    expect(stored.avatar).toBeNull();
  });
});
