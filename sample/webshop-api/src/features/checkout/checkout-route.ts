import { Type } from '@sinclair/typebox';
import { ErrorCode } from '@appweaver/common';
import {
  currentAuthUser,
  errorResponses,
  registerModel,
  registerRoute
} from '@appweaver/core';
import { ShopErrors } from '@/errors';
import { checkout } from './checkout';

const ShippingAddress = Type.Object({
  recipient: Type.String({ minLength: 2, maxLength: 150 }),
  street: Type.String({ minLength: 2, maxLength: 200 }),
  city: Type.String({ minLength: 1, maxLength: 100 }),
  postalCode: Type.String({ minLength: 1, maxLength: 20 }),
  country: Type.String({ pattern: '^[A-Z]{2}$', example: 'US' })
});

registerModel(
  Type.Object(
    {
      items: Type.Array(
        Type.Object({
          product: Type.Integer({ minimum: 1, example: 1 }),
          quantity: Type.Integer({ minimum: 1, maximum: 99, example: 1 })
        }),
        { minItems: 1, maxItems: 50 }
      ),
      couponCode: Type.Optional(
        Type.String({ pattern: '^[A-Z0-9]{4,20}$', example: 'WELCOME10' })
      ),
      // One of the two, a saved address of the customer or a new one
      addressId: Type.Optional(Type.Integer({ minimum: 1 })),
      shippingAddress: Type.Optional(ShippingAddress),
      note: Type.Optional(Type.String({ maxLength: 500 }))
    },
    { $id: 'CheckoutRequest' }
  )
);

registerRoute(
  (router) => {
    router.post(
      '/checkout',
      {
        schema: {
          tags: ['Orders'],
          summary: 'Place an order',
          description:
            'Reserves the stock, applies the coupon, and places the order, which is paid in the background.',
          body: Type.Ref('CheckoutRequest'),
          response: {
            201: Type.Ref('OrderSingle'),
            ...errorResponses(
              ShopErrors.ProductUnavailable,
              ShopErrors.OutOfStock,
              ShopErrors.CouponInvalid,
              ErrorCode.ResourceNotFound
            )
          }
        }
      },
      async (req, reply) => {
        const order = await checkout(currentAuthUser()!, req.body as any);
        return reply.status(201).send(order);
      }
    );
  },
  {
    // Every signed-in account may order, a burst of checkouts is throttled
    rateLimit: { max: 10, timeWindow: '1 minute' }
  }
);
