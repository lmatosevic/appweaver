import { config, makeHash, randomString } from '@appweaver/common';
import { db } from '@db/client';
import { Role } from '@/features/access/roles';

/**
 * The warehouse partner with the API key it calls the fulfillment routes with.
 */
export async function createStaff(): Promise<void> {
  // Signs in with its API key only, so it has no password
  const warehouse = await db.user.create({
    data: {
      firstName: 'Warehouse',
      lastName: 'Partner',
      email: 'warehouse@webshop.example.com',
      verifiedEmail: true,
      roles: { connect: [{ name: Role.Fulfillment }] }
    }
  });

  // Stored the way the API key service stores one: hashed, and masked
  const secret = randomString(64, { special: false, extra: false });
  const apiKey = await db.apiKey.create({
    data: {
      name: 'Warehouse integration',
      key: `...${secret.slice(-6)}`,
      keyHash: makeHash(secret),
      userId: warehouse.id
    }
  });

  console.log(
    `Warehouse API key: ${apiKey.id}${config.SECURITY_API_KEY_DELIMITER}${secret}`
  );
}
