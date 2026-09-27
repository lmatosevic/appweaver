import { Database } from '@appweaver/common';
import { Application, inject, injectService } from '@appweaver/core';
import { Role } from '@/features/access/roles';

export const PASSWORD = 'Passw0rd!';

const db = () => inject<any>(Database).client();

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Creates the roles of the seeder, unless an earlier test file did. */
export async function createRoles(): Promise<void> {
  for (const name of Object.values(Role)) {
    await db().role.upsert({ where: { name }, update: {}, create: { name } });
  }
}

/** Creates an account holding the role, with a unique email per name. */
export async function account(
  displayName: string,
  role: string = Role.Member
): Promise<any> {
  const { id } = await db().role.findUniqueOrThrow({ where: { name: role } });

  return injectService('User').create({
    displayName,
    email: `${displayName.toLowerCase()}@test.example.com`,
    password: PASSWORD,
    roles: [{ id }]
  });
}

/** Signs the account in, returning the authorization header. */
export async function signIn(
  app: Application,
  user: { email: string }
): Promise<Record<string, string>> {
  const response = await app.server.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: user.email, password: PASSWORD }
  });

  return { authorization: `Bearer ${response.json().accessToken}` };
}

/** Creates a movie in the given genres, created on the fly by their slug. */
export async function movie(
  title: string,
  genres: string[] = [],
  data: Record<string, any> = {}
): Promise<any> {
  return injectService('Movie').create({
    title,
    slug: slugify(title),
    genres: genres.map((name) => ({ name, slug: slugify(name) })),
    ...data
  });
}

/** Sends a request to the API, returning the status and the parsed body. */
export async function request(
  app: Application,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  options: { auth?: Record<string, string>; payload?: object } = {}
): Promise<{ status: number; body: any }> {
  const response = await app.server.inject({
    method,
    url: `/api${url}`,
    headers: options.auth,
    payload: options.payload
  });

  return { status: response.statusCode, body: response.json() };
}
