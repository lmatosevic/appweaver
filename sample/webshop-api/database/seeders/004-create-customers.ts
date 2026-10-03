import { hashPassword } from '@appweaver/core';
import { db } from '@db/client';
import { Role } from '@/features/access/roles';

/** Every demo customer signs in with this password. */
const DEMO_PASSWORD = 'Passw0rd!';

/**
 * Two customers with their address books, a delivered order, and the reviews
 * of what they bought.
 */
export async function createCustomers(): Promise<string> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const customer = (firstName: string, lastName: string) =>
    db.user.create({
      data: {
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}@example.com`,
        passwordHash,
        verifiedEmail: true,
        roles: { connect: [{ name: Role.Customer }] }
      }
    });

  const olivia = await customer('Olivia', 'Bennett');
  const daniel = await customer('Daniel', 'Hughes');

  const address = {
    recipient: 'Olivia Bennett',
    street: '1200 Maple Avenue',
    city: 'Portland',
    postalCode: '97205',
    country: 'US'
  };
  await db.address.create({
    data: { ...address, label: 'Home', isDefault: true, userId: olivia.id }
  });
  await db.address.create({
    data: {
      label: 'Home',
      recipient: 'Daniel Hughes',
      street: '48 Oak Street',
      city: 'Austin',
      postalCode: '78701',
      country: 'US',
      isDefault: true,
      userId: daniel.id
    }
  });

  const headphones = await db.product.findUniqueOrThrow({
    where: { slug: 'sonora-studio-wireless' }
  });
  const cable = await db.product.findUniqueOrThrow({
    where: { slug: 'kablo-usb-c-2m' }
  });

  const placedAt = new Date(Date.now() - 14 * 86_400_000);
  await db.order.create({
    data: {
      number: 'WS-DEMO-000001',
      status: 'Delivered',
      customerId: olivia.id,
      subtotal: headphones.price + cable.price,
      shippingCost: 0,
      total: headphones.price + cable.price,
      shippingAddress: address,
      createdAt: placedAt,
      paidAt: placedAt,
      shippedAt: new Date(placedAt.getTime() + 86_400_000),
      deliveredAt: new Date(placedAt.getTime() + 3 * 86_400_000),
      carrier: 'UPS',
      trackingNumber: 'UPS000000001',
      items: {
        create: [headphones, cable].map((product) => ({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unitPrice: product.price,
          quantity: 1,
          lineTotal: product.price
        }))
      }
    }
  });

  await db.review.createMany({
    data: [
      {
        productId: headphones.id,
        authorId: olivia.id,
        authorName: 'Olivia B.',
        rating: 5,
        title: 'Silence on the train',
        body: 'The noise cancelling is excellent and the battery lasts all week.',
        verifiedPurchase: true
      },
      {
        productId: headphones.id,
        authorId: daniel.id,
        authorName: 'Daniel H.',
        rating: 4,
        title: 'Great sound, tight fit',
        body: 'Sounds great, a bit tight on a larger head at first.'
      }
    ]
  });

  return `Seeded 2 customers, their password is ${DEMO_PASSWORD}`;
}
