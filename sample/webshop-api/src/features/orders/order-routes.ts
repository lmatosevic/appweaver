import { Type } from '@sinclair/typebox';
import { currentAuthUser, registerRoute } from '@appweaver/core';
import { Role } from '@/features/access/roles';
import { cancelOrder, deliverOrder, shipOrder } from './order-status';

const params = Type.Object({ id: Type.String() });

registerRoute((router) => {
  router.post(
    '/orders/:id/cancel',
    {
      schema: {
        tags: ['Orders'],
        summary: 'Cancel an order',
        description:
          'An order that has not shipped yet. The stock and the coupon are released.',
        params,
        response: {
          200: Type.Ref('OrderSingle')
        }
      }
    },
    async (req) => cancelOrder(req.params.id, currentAuthUser() ?? null)
  );
});

// Called by the warehouse partner with its API key, or by an admin
registerRoute(
  (router) => {
    router.post(
      '/orders/:id/ship',
      {
        schema: {
          tags: ['Fulfillment'],
          summary: 'Mark a paid order as shipped',
          description: 'The customer is emailed the tracking number.',
          params,
          body: Type.Object({
            carrier: Type.String({
              minLength: 2,
              maxLength: 50,
              example: 'UPS'
            }),
            trackingNumber: Type.String({
              minLength: 4,
              maxLength: 100,
              example: 'UPS123456789'
            })
          }),
          response: {
            200: Type.Ref('OrderSingle')
          }
        }
      },
      async (req) => shipOrder(req.params.id, req.body)
    );

    router.post(
      '/orders/:id/deliver',
      {
        schema: {
          tags: ['Fulfillment'],
          summary: 'Mark a shipped order as delivered',
          params,
          response: {
            200: Type.Ref('OrderSingle')
          }
        }
      },
      async (req) => deliverOrder(req.params.id)
    );
  },
  {
    auth: ['apiKey', 'jwt'],
    roles: [Role.Fulfillment, Role.Admin]
  }
);
