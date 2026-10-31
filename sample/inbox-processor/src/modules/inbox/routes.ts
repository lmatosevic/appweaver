import { Type } from '@sinclair/typebox';
import { ErrorCode } from '@appweaver/common';
import { inject } from '@appweaver/core';
import { errorResponses, registerRoute } from '@appweaver/web';
import { countEntries, retryEntry, submitLines } from './entries';
import { InboxErrors } from './errors';
import { InboxWatcher } from './inbox-watcher';

const count = Type.Integer({ minimum: 0 });

// Anyone submits lines and reads the counts
registerRoute(
  (router) => {
    router.post(
      '/inbox',
      {
        schema: {
          tags: ['Inbox'],
          summary: 'Submit lines of text',
          description:
            'Every line becomes an entry, queued for processing. The blank lines are skipped.',
          body: Type.Object({
            lines: Type.Array(Type.String({ maxLength: 2000 }), {
              minItems: 1,
              maxItems: 100,
              example: ['Urgent: the invoice is broken', '? retried once']
            })
          }),
          response: {
            202: Type.Object({
              entries: Type.Array(Type.Ref('Entry'))
            })
          }
        }
      },
      async (req, reply) => {
        const entries = await submitLines(req.body.lines, 'Api');
        return reply.status(202).send({ entries });
      }
    );

    router.get(
      '/inbox/stats',
      {
        schema: {
          tags: ['Inbox'],
          summary: 'Count the entries by status',
          response: {
            200: Type.Object({
              Pending: count,
              Processing: count,
              Processed: count,
              Failed: count
            })
          }
        }
      },
      () => countEntries()
    );
  },
  { public: true, rateLimit: { max: 60, timeWindow: '1 minute' } }
);

// An admin triggers the jobs
registerRoute(
  (router) => {
    router.post(
      '/inbox/scan',
      {
        schema: {
          tags: ['Inbox'],
          summary: 'Read the inbox file now',
          description:
            'Submits the lines appended to the inbox file since its last scan, without waiting for the watcher.',
          response: {
            200: Type.Object({ submitted: count })
          }
        }
      },
      async () => ({ submitted: await inject(InboxWatcher).scan() })
    );

    router.post(
      '/entries/:id/retry',
      {
        schema: {
          tags: ['Inbox'],
          summary: 'Process a failed entry again',
          params: Type.Object({ id: Type.Integer() }),
          response: {
            202: Type.Ref('EntrySingle'),
            ...errorResponses(
              ErrorCode.ResourceNotFound,
              InboxErrors.EntryNotFailed
            )
          }
        }
      },
      async (req, reply) =>
        reply.status(202).send(await retryEntry(req.params.id))
    );
  },
  { roles: ['Admin'] }
);
