# Webshop API

> Appweaver sample - Webshop API with catalog, cart checkout and order fulfillment

The backend of an online shop selling audio gear: a public catalog, customer accounts, a checkout reserving stock and
applying coupons, payments processed in the background, and a warehouse partner reporting shipments over an API key.
It runs on PostgreSQL and Redis, the production-like setup of the samples.

## What it showcases

| Feature                                                                                                             | Where                                                                                                          |
|---------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| PostgreSQL, and Redis for the cache, the rate limits, and the queue (docker-compose)                                | [`docker-compose.yml`](docker-compose.yml), [`appweaver.json`](appweaver.json)                                 |
| A transactional checkout: conditional stock reservation, coupon redemption, price copy                              | [`features/checkout/checkout.ts`](src/features/checkout/checkout.ts)                                           |
| Pure, unit tested pricing rules (cents, discounts, free shipping)                                                   | [`features/checkout/pricing.ts`](src/features/checkout/pricing.ts)                                             |
| A resource event emitted by hand, feeding a **BullMQ** payment worker                                               | [`features/payments/payment-worker.ts`](src/features/payments/payment-worker.ts)                               |
| **API key** authentication for a machine client (the warehouse)                                                     | [`features/orders/order-routes.ts`](src/features/orders/order-routes.ts)                                       |
| An order state machine with conflict-safe transitions                                                               | [`features/orders/order-status.ts`](src/features/orders/order-status.ts)                                       |
| A scheduled job cancelling unpaid orders and releasing their stock                                                  | [`features/orders/unpaid-orders-job.ts`](src/features/orders/unpaid-orders-job.ts)                             |
| A public registration route with reCAPTCHA (when enabled) and rate limiting                                         | [`features/checkout/register-route.ts`](src/features/checkout/register-route.ts)                               |
| Transactional emails queued through `EmailService`                                                                  | [`features/orders/order-emails.ts`](src/features/orders/order-emails.ts)                                       |
| Cache invalidation after writes made past the resource services                                                     | checkout, payments, and order status                                                                           |
| Read restrictions: the storefront sees active products, customers their own orders                                  | product and order policies                                                                                     |
| A `cuid(2)` string id for orders, and order lines copying the product at checkout                                   | order and order item models                                                                                    |
| Case-insensitive text search (`mode: 'insensitive'`, PostgreSQL)                                                    | [`resources/product/service.ts`](src/resources/product/service.ts)                                             |
| Verified purchase reviews, and public rating aggregates                                                             | [`resources/review/service.ts`](src/resources/review/service.ts)                                               |
| Sales reports through the aggregate route, CSV exports of orders and products                                       | order and product routes                                                                                       |
| Product image galleries with image processing                                                                       | [`resources/product/model.ts`](src/resources/product/model.ts)                                                 |
| Application error codes (`OUT_OF_STOCK`, ...) documented per route, a taken email answered by the unique constraint | [`errors.ts`](src/errors.ts), [`features/checkout/register-route.ts`](src/features/checkout/register-route.ts) |

## Getting started

Build the monorepo once from the repository root (`npm install && npm run build`), then in this directory:

```bash
cp .env.example .env                  # NODE_ENV=dev and the database credentials
docker compose up -d postgres redis   # PostgreSQL on :5432, Redis on :6379
npm run migrate                       # apply the migrations
npm run seed                          # roles, staff, the catalog, coupons, and two customers
npm run dev                           # http://localhost:5002, Swagger UI at http://localhost:5002/swagger
```

The seeder prints the generated admin password (`admin@webshop.example.com`) and the **warehouse API key**; keep the
key, it is not shown again. The demo customers `olivia@example.com` and `daniel@example.com` sign in with `Passw0rd!`.
The coupons are `WELCOME10` (10 %), `SAVE5` (5 EUR off from 30 EUR), `LAUNCH25` (25 %, limited), and the expired
`SUMMER20`.

In development the emails are written to the log by the JSON mailer (see [`appweaver.dev.json`](appweaver.dev.json)).
All the amounts are in cents.

## Try it out

```bash
# The catalog needs no account
curl -s localhost:5002/api/products/query -H 'content-type: application/json' \
  -d '{"sort":"price","size":20}' | jq '.items[] | {id, name, price, inStock, discountPercent}'

# Open an account, sign in, and place an order with a coupon
curl -s localhost:5002/api/register -H 'content-type: application/json' \
  -d '{"firstName":"Grace","lastName":"Lee","email":"grace@example.com","password":"Passw0rd!"}' | jq .id
TOKEN=$(curl -s localhost:5002/auth/login -H 'content-type: application/json' \
  -d '{"username":"grace@example.com","password":"Passw0rd!"}' | jq -r .accessToken)
curl -s localhost:5002/api/checkout -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "items": [{ "product": 1, "quantity": 1 }, { "product": 6, "quantity": 2 }],
  "couponCode": "WELCOME10",
  "shippingAddress": { "recipient": "Grace Lee", "street": "250 Pine Street", "city": "Seattle", "postalCode": "98101", "country": "US" }
}' | jq '{id, number, status, subtotal, discount, shippingCost, total}'

# A moment later the payment worker has marked it paid
curl -s localhost:5002/api/orders/<id> -H "authorization: Bearer $TOKEN" | jq '{status, paidAt}'

# The warehouse ships and delivers it with its API key
curl -s localhost:5002/api/orders/<id>/ship -H "x-api-key: $WAREHOUSE_KEY" -H 'content-type: application/json' \
  -d '{"carrier":"UPS","trackingNumber":"UPS123456789"}' | jq .status
curl -s -X POST localhost:5002/api/orders/<id>/deliver -H "x-api-key: $WAREHOUSE_KEY" | jq .status

# A review of the bought product is marked as a verified purchase
curl -s localhost:5002/api/reviews -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"product":1,"rating":5,"title":"Silence at last"}' | jq '{authorName, verifiedPurchase}'
```

An order above 10,000 EUR is declined by the simulated payment provider ([
`payment-gateway.ts`](src/features/payments/payment-gateway.ts)), which fails the order and releases its stock.

## Tests

```bash
npm run test  # unit tests
npm run e2e   # end-to-end tests, against the webshop-api-test database of the PostgreSQL container
```

The end-to-end tests need the PostgreSQL container running, while Redis is replaced by in-memory implementations (see [
`appweaver.test.json`](appweaver.test.json)).

## License

UNLICENSED
