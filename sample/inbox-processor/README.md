# Inbox Processor

> Appweaver sample - Inbox processor analysing text lines on a queue, fed by a file and an API

A small processing pipeline: lines of text arrive by being appended to a file in the project root or posted to the
API, each is recorded as an entry and put on a queue, and a worker analyses it (word count, normalized text, keyword
tags, a checksum), stores the results and appends them to an outbox file. Rejected lines fail at once, other errors
are retried, and an admin triggers a scan of the inbox file or a retry of a failed entry over the API.

Created with `npm create @appweaver inbox-processor -- --add web queue docker --port 5007`, which brings `data` (with
`web`) and `redis` (with `queue`).

## What it showcases

| Feature                                                                                    | Where                                                                  |
|--------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| A local module with its config, a lifecycle service, a `main` part and a `web` part         | [`modules/inbox/module.ts`](src/modules/inbox/module.ts)               |
| A queue worker with retries (BullMQ on Redis, in memory for the tests)                     | [`modules/inbox/main.ts`](src/modules/inbox/main.ts)                   |
| Permanent and transient failures: the attempts tracked on the entry, the same on any queue | [`modules/inbox/process-entry.ts`](src/modules/inbox/process-entry.ts) |
| A file watcher started and stopped with the application, its position kept in `Memory`     | [`modules/inbox/inbox-watcher.ts`](src/modules/inbox/inbox-watcher.ts) |
| Custom routes triggering the jobs: submit, scan, retry, and the counts by status           | [`modules/inbox/routes.ts`](src/modules/inbox/routes.ts)               |
| Public reads and admin-only writes of a resource written only by the pipeline              | [`resources/entry/routes.ts`](src/resources/entry/routes.ts)           |
| Application error codes (`LINE_REJECTED`, `ENTRY_NOT_FAILED`) mapped to 422 and 409        | [`modules/inbox/errors.ts`](src/modules/inbox/errors.ts)               |
| A JSON column of tags, and a Prisma `groupBy` for the counts                               | [`modules/inbox/entries.ts`](src/modules/inbox/entries.ts)             |
| End-to-end tests waiting for the queue, over HTTP and through the file                    | [`test/e2e/inbox.test.ts`](test/e2e/inbox.test.ts)                     |

## Getting started

Build the monorepo once from the repository root (`npm install && npm run build`), then in this directory:

```bash
cp .env.example .env         # NODE_ENV=dev
docker compose up -d redis   # Redis on :6379, for the queue and the inbox position
npm run migrate              # create the SQLite database in data/
npm run seed                 # the roles and the admin, printing the admin password
npm run dev                  # http://localhost:5007, Swagger UI at http://localhost:5007/swagger
```

`docker compose up` runs the whole stack instead. Its worker reads `inbox/inbox.txt` and writes `inbox/outbox.txt` of
the mounted `inbox/` directory (`INBOX_FILE_PATH` and `INBOX_OUTBOX_PATH`). Without Redis, run with
`MEMORY_PROVIDER=memory QUEUE_PROVIDER=memory`, the queue and the inbox position then living in the process.

## Try it out

Every line appended to `inbox.txt` becomes an entry, and its results land in `outbox.txt`:

```bash
echo "Urgent: the invoice payment failed" >> inbox.txt
echo "! this line is rejected" >> inbox.txt
echo "? this one fails its first attempt, then succeeds" >> inbox.txt
cat outbox.txt
# #1 b0210001c6db10b0 words=5 tags=invoice,urgent urgent the invoice payment failed
# #3 5afcc3d31f1ab91f words=8 tags=- this one fails its first attempt then succeeds
```

The same through the API, which also triggers the jobs:

```bash
# Anyone submits lines and follows them
curl -s localhost:5007/api/inbox -H 'content-type: application/json' \
  -d '{"lines":["Meeting tomorrow about the crash","How do I get a refund?"]}' | jq '[.entries[] | {id, status}]'
curl -s localhost:5007/api/inbox/stats
curl -s localhost:5007/api/entries/query -H 'content-type: application/json' \
  -d '{"filter":{"status":"Processed"},"sort":"-processedAt"}' | jq '.items[] | {id, words, tags, normalized}'

# An admin reads the inbox file now, and retries a failed entry
TOKEN=$(curl -s localhost:5007/auth/login -H 'content-type: application/json' \
  -d "{\"username\":\"admin@inbox.example.com\",\"password\":\"$ADMIN_PASSWORD\"}" | jq -r .accessToken)
curl -s -X POST localhost:5007/api/inbox/scan -H "authorization: Bearer $TOKEN"
curl -s -X POST localhost:5007/api/entries/2/retry -H "authorization: Bearer $TOKEN" | jq '{status, attempts}'
```

## Tests

```bash
npm run test  # unit tests of the analysis
npm run e2e   # the pipeline over HTTP and through the inbox file, with the in-memory queue
```

## License

UNLICENSED
