import { db } from '@db/client';

const categories = [
  { name: 'Headphones', slug: 'headphones', position: 1 },
  { name: 'Speakers', slug: 'speakers', position: 2 },
  { name: 'Accessories', slug: 'accessories', position: 3 }
];

// Made-up brands, so no real trademark is implied
const brands = [
  { name: 'Sonora', slug: 'sonora' },
  { name: 'Aurelia Audio', slug: 'aurelia-audio' },
  { name: 'Kablo', slug: 'kablo' }
];

const products: {
  name: string;
  slug: string;
  sku: string;
  category: string;
  brand: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  status?: 'Draft' | 'Active' | 'Archived';
  attributes: Record<string, string>;
  weightGrams: number;
  description: string;
}[] = [
  {
    name: 'Sonora Studio Wireless Headphones',
    slug: 'sonora-studio-wireless',
    sku: 'SON-STU-WL-BLK',
    category: 'headphones',
    brand: 'sonora',
    price: 12999,
    compareAtPrice: 15999,
    stock: 25,
    attributes: { color: 'Black', battery: '30 h', noiseCancelling: 'Yes' },
    weightGrams: 260,
    description: 'Over-ear wireless headphones with active noise cancelling.'
  },
  {
    name: 'Sonora Buds Pro',
    slug: 'sonora-buds-pro',
    sku: 'SON-BUD-PRO-WHT',
    category: 'headphones',
    brand: 'sonora',
    price: 8999,
    stock: 40,
    attributes: { color: 'White', battery: '8 h (32 h with case)' },
    weightGrams: 55,
    description: 'True wireless earbuds with a wireless charging case.'
  },
  {
    name: 'Aurelia Monitor 2',
    slug: 'aurelia-monitor-2',
    sku: 'AUR-MON-2',
    category: 'headphones',
    brand: 'aurelia-audio',
    price: 19900,
    stock: 3,
    attributes: { type: 'Open back', impedance: '250 Ohm' },
    weightGrams: 310,
    description: 'Open-back studio headphones for mixing and mastering.'
  },
  {
    name: 'Aurelia Bookshelf Speaker Pair',
    slug: 'aurelia-bookshelf-pair',
    sku: 'AUR-BKS-PAIR',
    category: 'speakers',
    brand: 'aurelia-audio',
    price: 34900,
    compareAtPrice: 39900,
    stock: 8,
    attributes: { power: '2 x 50 W', inputs: 'Bluetooth, optical, RCA' },
    weightGrams: 9200,
    description: 'A pair of powered bookshelf speakers with Bluetooth.'
  },
  {
    name: 'Sonora Go Portable Speaker',
    slug: 'sonora-go',
    sku: 'SON-GO-BLU',
    category: 'speakers',
    brand: 'sonora',
    price: 5999,
    stock: 0,
    attributes: { color: 'Blue', waterproof: 'IP67', battery: '12 h' },
    weightGrams: 540,
    description: 'A rugged, waterproof speaker for the outdoors.'
  },
  {
    name: 'Kablo Braided USB-C Cable 2 m',
    slug: 'kablo-usb-c-2m',
    sku: 'KAB-USBC-2M',
    category: 'accessories',
    brand: 'kablo',
    price: 1499,
    stock: 200,
    attributes: { length: '2 m', power: '100 W' },
    weightGrams: 60,
    description: 'A braided USB-C to USB-C cable rated for 100 W charging.'
  },
  {
    name: 'Kablo Headphone Stand',
    slug: 'kablo-headphone-stand',
    sku: 'KAB-STAND-ALU',
    category: 'accessories',
    brand: 'kablo',
    price: 2999,
    stock: 30,
    attributes: { material: 'Aluminium' },
    weightGrams: 450,
    description: 'An aluminium stand keeping the headband in shape.'
  },
  {
    name: 'Sonora Studio Wireless 2',
    slug: 'sonora-studio-wireless-2',
    sku: 'SON-STU2-WL-BLK',
    category: 'headphones',
    brand: 'sonora',
    price: 17999,
    stock: 0,
    status: 'Draft',
    attributes: { color: 'Black', battery: '40 h' },
    weightGrams: 250,
    description: 'The next generation, not released yet.'
  }
];

/** Categories, brands, eight products (one still a draft), and coupons. */
export async function createCatalog(): Promise<string> {
  const categoryIds = new Map<string, number>();
  for (const category of categories) {
    const created = await db.category.create({ data: category });
    categoryIds.set(category.slug, created.id);
  }

  const brandIds = new Map<string, number>();
  for (const brand of brands) {
    const created = await db.brand.create({ data: brand });
    brandIds.set(brand.slug, created.id);
  }

  for (const { category, brand, status, ...product } of products) {
    await db.product.create({
      data: {
        ...product,
        status: status ?? 'Active',
        categoryId: categoryIds.get(category),
        brandId: brandIds.get(brand)
      }
    });
  }

  const now = Date.now();
  await db.coupon.createMany({
    data: [
      { code: 'WELCOME10', type: 'Percentage', value: 10 },
      { code: 'SAVE5', type: 'Fixed', value: 500, minOrderTotal: 3000 },
      {
        code: 'LAUNCH25',
        type: 'Percentage',
        value: 25,
        maxRedemptions: 100,
        validUntil: new Date(now + 30 * 86_400_000)
      },
      {
        code: 'SUMMER20',
        type: 'Percentage',
        value: 20,
        validUntil: new Date(now - 86_400_000)
      }
    ]
  });

  return `Seeded ${products.length} products and 4 coupons`;
}
