import { hashPassword } from '@appweaver/data';
import { db } from '@db/client';
import { Role } from '@/features/access/roles';

/**
 * A demo curator, giving the live commentary of the realtime example, with
 * the password of the demo members.
 */
export async function createCurator(): Promise<string> {
  await db.user.create({
    data: {
      displayName: 'The Curator',
      email: 'curator@movies.example.com',
      passwordHash: await hashPassword('Passw0rd!'),
      verifiedEmail: true,
      roles: { connect: [{ name: Role.Curator }] }
    }
  });

  return 'Seeded the curator curator@movies.example.com';
}
