import { makeHash, randomString } from '@appweaver/common';
import { apiKeyConfig, hashPassword } from '@appweaver/data';
import { db } from '@db/client';
import { Role } from '@/features/access/roles';

/** The password of the demo accounts. */
const PASSWORD = 'Passw0rd!';

const staff = [
  {
    firstName: 'Petra',
    lastName: 'Kovač',
    email: 'dispatch@fleet.example.com',
    role: Role.Dispatcher,
    licenceCategories: []
  },
  {
    firstName: 'Marko',
    lastName: 'Babić',
    email: 'marko@fleet.example.com',
    role: Role.Driver,
    licenceCategories: ['B']
  },
  {
    firstName: 'Ana',
    lastName: 'Jurić',
    email: 'ana@fleet.example.com',
    role: Role.Driver,
    licenceCategories: ['B', 'C']
  },
  {
    firstName: 'Ivan',
    lastName: 'Novak',
    email: 'ivan@fleet.example.com',
    role: Role.Driver,
    licenceCategories: ['B', 'C', 'CE']
  }
];

/**
 * A dispatcher, three drivers, and the telematics gateway with the API key it reports the pings with.
 */
export async function createStaff(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD);
  for (const { role, ...user } of staff) {
    await db.user.create({
      data: {
        ...user,
        passwordHash,
        verifiedEmail: true,
        roles: { connect: [{ name: role }] }
      }
    });
  }

  // Signs in with its API key only, so it has no password
  const gateway = await db.user.create({
    data: {
      firstName: 'Telematics',
      lastName: 'Gateway',
      email: 'gateway@fleet.example.com',
      verifiedEmail: true,
      roles: { connect: [{ name: Role.Tracker }] }
    }
  });

  // Stored the way the API key service stores one: hashed, and masked
  const secret = randomString(64, { special: false, extra: false });
  const apiKey = await db.apiKey.create({
    data: {
      name: 'Telematics gateway',
      key: `...${secret.slice(-6)}`,
      keyHash: makeHash(secret),
      userId: gateway.id
    }
  });

  console.log(
    `Telematics gateway API key: ${apiKey.id}${apiKeyConfig.DELIMITER}${secret}`
  );
}
