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

  const iva = await customer('Iva', 'Perić');
  const marko = await customer('Marko', 'Horvat');

  const address = {
    recipient: 'Iva Perić',
    street: 'Ilica 10',
    city: 'Zagreb',
    postalCode: '10000',
    country: 'HR'
  };
  await db.address.create({
    data: { ...address, label: 'Home', isDefault: true, userId: iva.id }
  });
  await db.address.create({
    data: {
      label: 'Home',
      recipient: 'Marko Horvat',
      street: 'Riva 5',
      city: 'Split',
      postalCode: '21000',
      country: 'HR',
      isDefault: true,
      userId: marko.id
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
      customerId: iva.id,
      subtotal: headphones.price + cable.price,
      shippingCost: 0,
      total: headphones.price + cable.price,
      shippingAddress: address,
      createdAt: placedAt,
      paidAt: placedAt,
      shippedAt: new Date(placedAt.getTime() + 86_400_000),
      deliveredAt: new Date(placedAt.getTime() + 3 * 86_400_000),
      carrier: 'GLS',
      trackingNumber: 'GLS000000001',
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
        authorId: iva.id,
        authorName: 'Iva P.',
        rating: 5,
        title: 'Silence on the train',
        body: 'The noise cancelling is excellent and the battery lasts all week.',
        verifiedPurchase: true
      },
      {
        productId: headphones.id,
        authorId: marko.id,
        authorName: 'Marko H.',
        rating: 4,
        title: 'Great sound, tight fit',
        body: 'Sounds great, a bit tight on a larger head at first.'
      }
    ]
  });

  return `Seeded 2 customers, their password is ${DEMO_PASSWORD}`;
}
