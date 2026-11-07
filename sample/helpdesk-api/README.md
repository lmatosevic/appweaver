# Helpdesk API

> Appweaver sample - Helpdesk API with support tickets, SLAs and integrations

A customer support desk in the spirit of Zendesk or Freshdesk: tickets from a public form and from other systems,
customers without accounts, automatic assignment to agents, SLA targets with escalation, internal notes, and long
threads read page by page. It runs on MySQL (MariaDB) without Redis.

## What it showcases

| Feature                                                                                | Where                                                                                                             |
|----------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| MySQL through the MariaDB adapter (docker-compose), long texts stored as `MEDIUMTEXT`  | [`docker-compose.yml`](docker-compose.yml), [`ticket-message/model.ts`](src/resources/ticket-message/model.ts)    |
| Redis-free: in-memory cache, rate limits, and queue, with the mailer and the scheduler | [`appweaver.json`](appweaver.json)                                                                                |
| A non-auth model (customers) connected-or-created by email through a relation input    | [`resources/ticket/model.ts`](src/resources/ticket/model.ts)                                                      |
| Tags created on the fly, matched by their slug                                         | [`resources/ticket/model.ts`](src/resources/ticket/model.ts)                                                      |
| A create-only virtual input (`description`) turned into the opening message            | [`resources/ticket/service.ts`](src/resources/ticket/service.ts)                                                  |
| A public form route with reCAPTCHA (when enabled) and rate limiting                    | [`features/intake/support-form-route.ts`](src/features/intake/support-form-route.ts)                              |
| **API key** integrations limited to the tickets they opened                            | [`resources/ticket/policy.ts`](src/resources/ticket/policy.ts)                                                    |
| Internal notes hidden by read restrictions, and write restrictions per caller type     | [`resources/ticket-message/policy.ts`](src/resources/ticket-message/policy.ts)                                    |
| Least-loaded automatic assignment on the ticket `create` event                         | [`features/assignment/auto-assign.ts`](src/features/assignment/auto-assign.ts)                                    |
| SLA deadlines from a policy table, and a scheduled escalation job                      | [`features/sla/`](src/features/sla/escalation-job.ts)                                                             |
| Service hooks moving the ticket status with every reply, and emailing the customer     | [`resources/ticket-message/service.ts`](src/resources/ticket-message/service.ts)                                  |
| Cursor pagination through long message threads                                         | [`test/e2e/conversation.test.ts`](test/e2e/conversation.test.ts)                                                  |
| Message attachments (array files) and a computed `overdue` flag                        | message and ticket models                                                                                         |
| OAuth2 sign-in limited to existing staff (`checkOAuth2User`)                           | [`resources/user/service.ts`](src/resources/user/service.ts)                                                      |
| Optional 2FA by SMS (Twilio), authenticator app or email, enabled by SMS for the admin | [`004-enable-admin-sms-2fa.ts`](database/seeders/004-enable-admin-sms-2fa.ts), [`appweaver.json`](appweaver.json) |

## Getting started

Build the monorepo once from the repository root (`npm install && npm run build`), then in this directory:

```bash
cp .env.example .env         # NODE_ENV=dev and the database password
docker compose up -d mysql   # MariaDB on :3306
npm run migrate              # apply the migrations
npm run seed                 # roles, teams, agents, the SLA policies, and demo tickets
npm run dev                  # http://localhost:5004, Swagger UI at http://localhost:5004/swagger
```

`docker compose up` runs the whole stack instead, its containers setting the `DB_HOST` the URL of `appweaver.json`
references to the `mysql` service. The database password comes from `.env`.

The seeder prints the generated admin password (`admin@helpdesk.example.com`) and the **status page API key**; keep
the key, it is not shown again. The agents `nicole@`, `ethan@`, `laura@`, and `tom@helpdesk.example.com` (Tom is away)
sign in with `Passw0rd!`. The demo ticket `HD-DEMO02` is past its resolution target, so the escalation job raises it
within five minutes of starting the server.

The application connects as the `helpdesk-api` user, which [`database/mariadb-init.sh`](database/mariadb-init.sh) grants
every database when the container first initializes its volume, since Prisma Migrate creates a shadow database next to
it. The emails are written to the log by the JSON mailer (the `mailer` of [`appweaver.json`](appweaver.json)), so the
sample needs no SMTP server.

### Two-factor authentication

2FA is optional: an agent enables the `Sms`, `Totp` (an authenticator app) or `Email` method on their own (see the 2FA
routes in Swagger), while the admin signs in with a code sent by SMS. The `004` seeder verifies the `ADMIN_PHONE_NUMBER`
of `.env` and enables the
SMS method of the admin; without it, the admin verifies a number and enables the method themselves. In development the
codes are written to the log by the JSON SMS sender, unless `.env` selects Twilio:

```bash
SMS_PROVIDER=twilio
SMS_TWILIO_ACCOUNT_SID=AC...
SMS_TWILIO_AUTH_TOKEN=...
SMS_SENDER=+1...                # a number of the Twilio account
ADMIN_PHONE_NUMBER=+385...      # E.164 format
```

The sign-in of the admin then answers with tokens of the `2fa` scope, exchanged for the full ones with the code:

```bash
TOKEN=$(curl -s localhost:5004/auth/login -H 'content-type: application/json' \
  -d '{"username":"admin@helpdesk.example.com","password":"<admin password>"}' | jq -r .accessToken)
CHALLENGE=$(curl -s -X POST localhost:5004/auth/account/2fa/challenge -H "authorization: Bearer $TOKEN" | jq -r .challengeId)
OTT=$(curl -s localhost:5004/auth/account/2fa/verify -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"challengeId\":\"$CHALLENGE\",\"code\":\"<code from the SMS>\"}" | jq -r .token)
curl -s localhost:5004/auth/exchange-token -H 'content-type: application/json' -d "{\"token\":\"$OTT\"}" | jq .
```

The `Totp` method needs the `SECURITY_ACCOUNT_2FA_TOTP_ENCRYPTION_KEY` of `.env`, any secret text, which encrypts the
secrets of the authenticator apps in the database; without it the method is not offered. Keep the key once users have
enabled the method, since their secrets cannot be decrypted with another one. An agent adds the app with the
`otpauthUrl` of the setup, shown as a QR code, and confirms it with a first code:

```bash
curl -s -X POST localhost:5004/auth/account/2fa/totp/setup -H "authorization: Bearer $TOKEN" | jq .otpauthUrl
curl -s localhost:5004/auth/account/2fa/totp/confirm -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"code":"<code from the app>"}'
```

[`.env.test`](.env.test) selects the JSON SMS sender over `.env`, so the tests never send a real SMS.

## Try it out

```bash
# Anyone opens a ticket through the support form, and gets the reference back
curl -s localhost:5004/api/support/tickets -H 'content-type: application/json' -d '{
  "name": "Zoran", "email": "zoran@example.com",
  "subject": "Order not arrived", "description": "My order from last week has not arrived yet."
}'

# Another system opens tickets with its API key, tags included
curl -s localhost:5004/api/tickets -H "x-api-key: $STATUS_PAGE_KEY" -H 'content-type: application/json' -d '{
  "subject": "API latency above target", "description": "p95 latency is above 2 seconds.", "priority": "High",
  "customer": { "email": "ops@globex.example.com", "name": "Globex Ops" },
  "tags": [{ "name": "Outage", "slug": "outage" }, { "name": "Latency", "slug": "latency" }]
}' | jq '{id, reference, tags: [.tags[].slug]}'

# An agent sees who got what, replies, and leaves an internal note
TOKEN=$(curl -s localhost:5004/auth/login -H 'content-type: application/json' \
  -d '{"username":"ethan@helpdesk.example.com","password":"Passw0rd!"}' | jq -r .accessToken)
curl -s localhost:5004/api/tickets/query -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"filter":{"status":["New","Open"]},"sort":"resolutionDueAt"}' | jq '.items[] | {reference, priority, assignee: .assignee.name, overdue}'
curl -s localhost:5004/api/messages -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"ticket":"<id>","body":"We are looking into it."}' > /dev/null
curl -s localhost:5004/api/messages -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"ticket":"<id>","body":"The cache cluster is degraded.","internal":true}' > /dev/null

# The integration never sees the internal note
curl -s localhost:5004/api/messages/query -H "x-api-key: $STATUS_PAGE_KEY" -H 'content-type: application/json' \
  -d '{"filter":{"ticket":"<id>"}}' | jq '[.items[] | {body, internal}]'

# A long thread is read page by page: send the nextCursor back until there is none
curl -s localhost:5004/api/messages/query -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"filter":{"ticket":"<id>"},"sort":"createdAt","size":2}' | jq '{bodies: [.items[].body], nextCursor}'
```

## Tests

```bash
npm run test  # unit tests
npm run e2e   # end-to-end tests, against the helpdesk-api-test database of the MariaDB container
```

## License

UNLICENSED
