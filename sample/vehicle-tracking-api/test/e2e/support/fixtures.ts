import {
  Database,
  GeoPosition,
  makeHash,
  randomString
} from '@appweaver/common';
import { Application, inject } from '@appweaver/core';
import { apiKeyConfig, hashPassword } from '@appweaver/data';
import { Role } from '@/features/access/roles';

export const PASSWORD = 'Passw0rd!';

/** Keeps the records of one run apart from those a failed reset left. */
export const RUN = Date.now().toString(36);

export const db = () => inject<any>(Database).client();

let devices = 0;

/** Creates the roles of the seeder, unless a test file running beside it did. */
export async function createRoles(): Promise<void> {
  // One INSERT ... ON CONFLICT DO NOTHING, as an upsert races the other files
  await db().role.createMany({
    data: Object.values(Role).map((name) => ({ name })),
    skipDuplicates: true
  });
}

/** Creates an account holding the role, returning its id and authorization header. */
export async function account(
  app: Application,
  name: string,
  role: string
): Promise<{ id: number; auth: Record<string, string> }> {
  const email = `${name.toLowerCase()}.${RUN}@test.example.com`;
  const user = await db().user.create({
    data: {
      firstName: name,
      lastName: 'Tester',
      email,
      passwordHash: await hashPassword(PASSWORD),
      roles: { connect: [{ name: role }] }
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

/** Creates the telematics gateway, returning its API key header. */
export async function gateway(): Promise<Record<string, string>> {
  const user = await db().user.create({
    data: {
      firstName: 'Gateway',
      lastName: RUN,
      email: `gateway.${RUN}@test.example.com`,
      roles: { connect: [{ name: Role.Tracker }] }
    }
  });

  const secret = randomString(64, { special: false, extra: false });
  const apiKey = await db().apiKey.create({
    data: { key: '...', keyHash: makeHash(secret), userId: user.id }
  });
  return { 'x-api-key': `${apiKey.id}${apiKeyConfig.DELIMITER}${secret}` };
}

/** A closed polygon of a box `[minLng, minLat, maxLng, maxLat]`. */
export function box(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat]
      ]
    ]
  };
}

export function point(position: GeoPosition) {
  return { type: 'Point', coordinates: position };
}

/** Creates a vehicle with a tracker unique to this run. */
export async function vehicle(
  data: Record<string, unknown> = {}
): Promise<{ id: number; name: string; deviceId: string; plate: string }> {
  devices++;
  const suffix = `${RUN}${devices}`.toUpperCase();
  return db().vehicle.create({
    data: {
      name: `Vehicle ${suffix}`,
      plate: `T-${suffix}`.slice(0, 16),
      deviceId: String(Date.now() * 100 + devices).padStart(15, '0'),
      type: 'Van',
      fuelCapacity: 80,
      ...data
    }
  });
}

/** Sends a request to the API, returning the status and the parsed body. */
export async function request(
  app: Application,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

/** The time `seconds` after a start, as an ISO string. */
export function at(start: number, seconds: number): string {
  return new Date(start + seconds * 1000).toISOString();
}
