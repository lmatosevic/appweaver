import { config, Database, makeHash, randomString } from '@appweaver/common';
import { Application, hashPassword, inject } from '@appweaver/core';
import { Role } from '@/features/access/roles';

export const PASSWORD = 'Passw0rd!';

/** Keeps the records of one run apart from those a failed reset left. */
export const RUN = Date.now().toString(36);

const db = () => inject<any>(Database).client();

/** Creates the roles of the seeder, unless an earlier test file did. */
export async function createRoles(): Promise<void> {
  for (const name of Object.values(Role)) {
    await db().role.upsert({ where: { name }, update: {}, create: { name } });
  }
}

/** Registers a customer through the public registration route. */
export async function registerCustomer(
  app: Application,
  name: string
): Promise<{ id: number; email: string; auth: Record<string, string> }> {
  const email = `${name.toLowerCase()}.${RUN}@test.example.com`;
  const registered = await app.server.inject({
    method: 'POST',
    url: '/api/register',
    payload: { firstName: name, lastName: 'Tester', email, password: PASSWORD }
  });

  return {
    id: registered.json().id,
    email,
    auth: await signIn(app, email)
  };
}

/** Creates a staff account holding the role. */
export async function staff(
  app: Application,
  name: string,
  role: string
): Promise<Record<string, string>> {
  const email = `${name.toLowerCase()}.${RUN}@test.example.com`;
  await db().user.create({
    data: {
      firstName: name,
      lastName: 'Staff',
      email,
      passwordHash: await hashPassword(PASSWORD),
      roles: { connect: [{ name: role }] }
    }
  });

  return signIn(app, email);
}

/** Creates the warehouse partner, returning its API key header. */
export async function warehouse(): Promise<Record<string, string>> {
  const user = await db().user.create({
    data: {
      firstName: 'Warehouse',
      lastName: RUN,
      email: `warehouse.${RUN}@test.example.com`,
      roles: { connect: [{ name: Role.Fulfillment }] }
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

/** Signs in, returning the authorization header. */
export async function signIn(
  app: Application,
  email: string
): Promise<Record<string, string>> {
  const response = await app.server.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: email, password: PASSWORD }
  });

  return { authorization: `Bearer ${response.json().accessToken}` };
}

/** Creates an active product, unique to this run. */
export async function product(
  sku: string,
  price: number,
  stock: number,
  status: 'Draft' | 'Active' = 'Active'
): Promise<{ id: number; sku: string }> {
  const unique = `${sku}-${RUN}`.toUpperCase();
  return db().product.create({
    data: {
      name: `Product ${unique}`,
      slug: unique.toLowerCase(),
      sku: unique,
      price,
      stock,
      status
    }
  });
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

/** Waits until the check passes, as the payment worker runs in the background. */
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

export const ADDRESS = {
  recipient: 'Test Customer',
  street: 'Ilica 1',
  city: 'Zagreb',
  postalCode: '10000',
  country: 'HR'
};
