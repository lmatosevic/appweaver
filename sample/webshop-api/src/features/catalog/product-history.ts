import { Events } from '@appweaver/common';
import { inject, TimeSeriesService } from '@appweaver/core';
import { Product } from '@/types';

type StockChange = { productId: number; stock: number; sold?: number };

// The price and the stock of a product are recorded whenever an admin sets
// them, and the units sold with every checkout (see the checkout feature)
inject(Events).onResourceEvent<Product>('Product', 'create', ({ current }) =>
  recordProduct(current)
);

inject(Events).onResourceEvent<Product>(
  'Product',
  'update',
  ({ current, previous }) => recordProduct(current, previous)
);

/**
 * Records the price and the stock of a product, the ones that changed since its previous state.
 */
export async function recordProduct(
  current: Product,
  previous?: Product
): Promise<void> {
  const values: { price?: number; stock?: number } = {};
  if (current.price !== previous?.price) {
    values.price = current.price;
  }
  if (current.stock !== previous?.stock) {
    values.stock = current.stock;
  }
  if (Object.keys(values).length > 0) {
    await inject(TimeSeriesService).write('Product', [
      { resourceId: current.id, values }
    ]);
  }
}

/**
 * Records the stock left of each product, with the units sold by an order. Called in the transaction placing or
 * releasing the order, so the points are queued once it commits, and dropped if it rolls back.
 */
export async function recordStock(changes: StockChange[]): Promise<void> {
  const time = new Date();
  await inject(TimeSeriesService).write(
    'Product',
    changes.map(({ productId, stock, sold }) => ({
      resourceId: productId,
      time,
      values: { stock, ...(sold !== undefined ? { sold } : {}) }
    }))
  );
}
