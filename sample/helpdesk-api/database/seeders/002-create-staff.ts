import { hashPassword } from '@appweaver/core';
import { config, makeHash, randomString } from '@appweaver/common';
import { db } from '@db/client';
import { Role } from '@/features/access/roles';

/** Every demo agent signs in with this password. */
const DEMO_PASSWORD = 'Passw0rd!';

/**
 * Two teams with their agents, and the status page integration with the API
 * key it opens tickets with.
 */
export async function createStaff(): Promise<string> {
  const billing = await db.team.create({
    data: {
      name: 'Billing',
      slug: 'billing',
      email: 'billing@helpdesk.example.com'
    }
  });
  const technical = await db.team.create({
    data: {
      name: 'Technical',
      slug: 'technical',
      email: 'technical@helpdesk.example.com'
    }
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const agents: [string, number, boolean][] = [
    ['Nicole', billing.id, true],
    ['Ethan', technical.id, true],
    ['Laura', technical.id, true],
    ['Tom', technical.id, false]
  ];
  for (const [name, teamId, available] of agents) {
    await db.user.create({
      data: {
        name: `${name} Agent`,
        email: `${name.toLowerCase()}@helpdesk.example.com`,
        passwordHash,
        verifiedEmail: true,
        available,
        teamId,
        roles: { connect: [{ name: Role.Agent }] }
      }
    });
  }

  const statusPage = await db.user.create({
    data: {
      name: 'Status page',
      email: 'status-page@helpdesk.example.com',
      verifiedEmail: true,
      roles: { connect: [{ name: Role.Integration }] }
    }
  });

  // Stored the way the API key service stores one: hashed, and masked
  const secret = randomString(64, { special: false, extra: false });
  const apiKey = await db.apiKey.create({
    data: {
      name: 'Status page integration',
      key: `...${secret.slice(-6)}`,
      keyHash: makeHash(secret),
      userId: statusPage.id
    }
  });
  console.log(
    `Status page API key: ${apiKey.id}${config.SECURITY_API_KEY_DELIMITER}${secret}`
  );

  return `Seeded 4 agents, their password is ${DEMO_PASSWORD}`;
}
