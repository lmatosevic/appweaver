import { Type } from '@sinclair/typebox';
import { createAiTool } from '@appweaver/ai';
import { injectService } from '@appweaver/core';
import { Order } from '@/types';

// Every tool runs as the customer of the chat, so the order policy keeps the
// assistant to their own orders, and the product policy to the active ones

const OrderStatus = Type.Union([
  Type.Literal('Pending'),
  Type.Literal('Paid'),
  Type.Literal('Shipped'),
  Type.Literal('Delivered'),
  Type.Literal('Cancelled'),
  Type.Literal('PaymentFailed')
]);

/** What the model is told of an order, amounts in cents. */
const summarize = (
  order: Pick<
    Order,
    | 'number'
    | 'status'
    | 'total'
    | 'createdAt'
    | 'paidAt'
    | 'shippedAt'
    | 'deliveredAt'
    | 'cancelledAt'
    | 'carrier'
    | 'trackingNumber'
  >
) => ({
  number: order.number,
  status: order.status,
  total: order.total,
  placedAt: order.createdAt,
  paidAt: order.paidAt,
  shippedAt: order.shippedAt,
  deliveredAt: order.deliveredAt,
  cancelledAt: order.cancelledAt,
  carrier: order.carrier,
  trackingNumber: order.trackingNumber
});

export const listMyOrders = createAiTool({
  name: 'listMyOrders',
  description:
    'The latest orders of the customer, newest first: number, status, total in cents, dates, carrier and tracking number.',
  parameters: Type.Object({
    status: Type.Optional(OrderStatus),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, default: 5 }))
  }),
  execute: async ({ status, limit }) => {
    const { items } = await injectService('Order').query({
      filter: status ? { status } : {},
      size: limit,
      totalCount: false
    });
    return items.map(summarize);
  }
});

export const getOrder = createAiTool({
  name: 'getOrder',
  description:
    'An order of the customer by its number (i.e. WS-2026-000042), with its lines: product, quantity and prices in cents.',
  parameters: Type.Object({ number: Type.String() }),
  execute: async ({ number }) => {
    const { items } = await injectService('Order').query({
      filter: { number: number.trim().toUpperCase() },
      size: 1,
      totalCount: false
    });
    if (!items.length) {
      return `No order ${number} found for this customer.`;
    }
    const order = await injectService('Order').find(items[0].id);
    return {
      ...summarize(order),
      subtotal: order.subtotal,
      discount: order.discount,
      shippingCost: order.shippingCost,
      lines: (order.items ?? []).map((item) => ({
        product: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal
      }))
    };
  }
});

export const searchProducts = createAiTool({
  name: 'searchProducts',
  description:
    'Searches the catalog by name, description or SKU: the matching products with their price in cents and whether they are in stock. The query is matched as a part of the text, so pass one short word in the singular (speaker, not speakers), and try another word when nothing is found.',
  parameters: Type.Object({ query: Type.String({ minLength: 2 }) }),
  execute: async ({ query }) => {
    const { items } = await injectService('Product').query({
      filter: { searchText: query },
      size: 5,
      totalCount: false
    });
    return items.map((product) => ({
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      inStock: product.stock > 0
    }));
  }
});
