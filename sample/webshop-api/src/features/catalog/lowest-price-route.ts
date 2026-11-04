import { Type } from '@sinclair/typebox';
import { ErrorCode } from '@appweaver/common';
import { inject, injectService, TimeSeriesService } from '@appweaver/core';
import { errorResponses, registerRoute } from '@appweaver/web';

const DAYS = 30;

// The lowest price of the last 30 days, which a shop shows beside a discount
// in the EU (the Omnibus directive), from the price history of the product
registerRoute(
  (router) => {
    router.get(
      '/products/:id/lowest-price',
      {
        schema: {
          tags: ['Products'],
          summary: 'The lowest price of a product in the last 30 days',
          description:
            'The current price counts too, so a product whose price never changed returns it.',
          params: Type.Object({ id: Type.Integer() }),
          response: {
            200: Type.Object({
              productId: Type.Integer(),
              price: Type.Integer({ example: 12999 }),
              lowestPrice: Type.Integer({ example: 11999 }),
              days: Type.Integer({ example: DAYS })
            }),
            ...errorResponses(ErrorCode.ResourceNotFound)
          }
        }
      },
      async (req) => {
        // Through the product service, so a draft stays out of the storefront
        const product = await injectService('Product').find(req.params.id);
        const [history] = await inject(TimeSeriesService).query('Product', {
          resourceIds: [product.id],
          fields: ['price'],
          from: new Date(Date.now() - DAYS * 86_400_000),
          aggregate: 'min'
        });

        const lowest = history?.values.price;
        return {
          productId: product.id,
          price: product.price,
          lowestPrice: Math.min(product.price, lowest ?? product.price),
          days: DAYS
        };
      }
    );
  },
  { public: true, cacheTTL: 60_000 }
);
