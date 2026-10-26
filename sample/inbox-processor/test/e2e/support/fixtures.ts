import { Application } from '@appweaver/core';
import { hashPassword } from '@appweaver/data';
import db from '@db/client';

const PASSWORD = 'Passw0rd!';

/** Keeps the records of one run apart from those a failed reset left. */
export const RUN = Date.now().toString(36);

/** Creates an admin, returning the authorization header of its token. */
export async function admin(app: Application): Promise<Record<string, string>> {
  const email = `admin.${RUN}@test.example.com`;
  await db.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'Tester',
      email,
      passwordHash: await hashPassword(PASSWORD),
      roles: {
        connectOrCreate: {
          where: { name: 'Admin' },
          create: { name: 'Admin' }
        }
      }
    }
  });

  const response = await app.server.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: email, password: PASSWORD }
  });
  return { authorization: `Bearer ${response.json().accessToken}` };
}

/** Waits until the value read matches, failing after the timeout. */
export async function eventually<T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean,
  timeout = 5_000
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (matches(value) || Date.now() > deadline) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
