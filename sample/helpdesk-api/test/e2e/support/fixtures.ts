import { config, Database, makeHash, randomString } from '@appweaver/common';
import { Application, hashPassword, inject } from '@appweaver/core';
import { Role } from '@/features/access/roles';

export const PASSWORD = 'Passw0rd!';

/** Keeps the records of one run apart from those a failed reset left. */
export const RUN = Date.now().toString(36);

export const db = () => inject<any>(Database).client();

/** Creates the roles of the seeder, unless an earlier test file did. */
export async function createRoles(): Promise<void> {
  for (const name of Object.values(Role)) {
    await db().role.upsert({ where: { name }, update: {}, create: { name } });
  }
}

/** Creates a team of its own for a test. */
export async function team(name: string): Promise<{ id: number }> {
  const slug = `${name}-${RUN}`.toLowerCase();
  return db().team.create({
    data: { name: slug, slug, email: `${slug}@test.example.com` }
  });
}

/** Creates an agent, returning it with its authorization header. */
export async function agent(
  app: Application,
  name: string,
  data: { teamId?: number; available?: boolean; role?: string } = {}
): Promise<{ id: number; auth: Record<string, string> }> {
  const email = `${name.toLowerCase()}.${RUN}@test.example.com`;
  const user = await db().user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(PASSWORD),
      teamId: data.teamId,
      available: data.available ?? true,
      roles: { connect: [{ name: data.role ?? Role.Agent }] }
    }
  });

  const response = await app.server.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: email, password: PASSWORD }
  });

  return {
    id: user.id,
    auth: { authorization: `Bearer ${response.json().accessToken}` }
  };
}

/** Creates an integration, returning its API key header. */
export async function integration(
  name: string
): Promise<Record<string, string>> {
  const user = await db().user.create({
    data: {
      name,
      email: `${name.toLowerCase()}.${RUN}@test.example.com`,
      roles: { connect: [{ name: Role.Integration }] }
    }
  });

  const secret = randomString(64, { special: false, extra: false });
  const apiKey = await db().apiKey.create({
    data: { key: '...', keyHash: makeHash(secret), userId: user.id }
  });

  return {
    'x-api-key': `${apiKey.id}${config.SECURITY_API_KEY_DELIMITER}${secret}`
  };
}

/** Sends a request to the API, returning the status and the parsed body. */
export async function request(
  app: Application,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  options: { headers?: Record<string, string>; payload?: object } = {}
): Promise<{ status: number; body: any }> {
  const response = await app.server.inject({
    method,
    url: `/api${url}`,
    headers: options.headers,
    payload: options.payload
  });

  return { status: response.statusCode, body: response.json() };
}

/** Waits until the check passes, as the assignment runs on an event. */
export async function eventually<T>(
  read: () => Promise<T>,
  check: (value: T) => boolean,
  timeout = 5_000
): Promise<T> {
  const deadline = Date.now() + timeout;
  let value = await read();
  while (!check(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = await read();
  }
  return value;
}
