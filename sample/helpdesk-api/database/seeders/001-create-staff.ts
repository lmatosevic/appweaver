import { hashPassword } from '@appweaver/core';
import { config, makeHash, randomString } from '@appweaver/common';
import { db } from '@db/client';
import { Role } from '@/features/access/roles';

/** Every demo agent signs in with this password. */
const DEMO_PASSWORD = 'Passw0rd!';

/**
 * The roles, two teams with their agents, the admin, and the status page
 * integration with the API key it opens tickets with.
 */
export async function createStaff(): Promise<string> {
  for (const name of Object.values(Role)) {
    await db.role.create({ data: { name } });
  }

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

  let password = config.SYSTEM_ADMIN_INITIAL_PASSWORD;
  if (!password) {
    password = randomString(16, { extra: false });
    console.log(`Generated admin password: ${password}`);
  }

  await db.user.create({
    data: {
      name: 'Helpdesk Admin',
      email: config.SYSTEM_ADMIN_INITIAL_EMAIL,
      passwordHash: await hashPassword(password),
      verifiedEmail: true,
      roles: { connect: [{ name: Role.Admin }] }
    }
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const agents: [string, number, boolean][] = [
    ['Nika', billing.id, true],
    ['Filip', technical.id, true],
    ['Lana', technical.id, true],
    ['Tin', technical.id, false]
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
