import fs from 'node:fs';
import { Application, createApp } from '@appweaver/core';
import db from '@db/client';
import { inboxConfig } from '@/modules/inbox/config';
import { resetTestData } from './support/reset';
import { admin, eventually, RUN } from './support/fixtures';

/**
 * The entries submitted over HTTP and through the inbox file, processed by the
 * queue worker: the results, the rejected lines, the retries and the outbox.
 */
describe('Inbox', () => {
  let app: Application;
  let auth: Record<string, string>;

  const request = (
    method: 'GET' | 'POST',
    url: string,
    payload?: object,
    headers: Record<string, string> = {}
  ) => app.server.inject({ method, url: `/api${url}`, payload, headers });

  const submit = async (...lines: string[]) =>
    (await request('POST', '/inbox', { lines })).json().entries as {
      id: number;
    }[];

  /** The entry once it is no longer waiting to be processed. */
  const settled = (id: number) =>
    eventually(
      () => db.entry.findUniqueOrThrow({ where: { id } }),
      (entry) => entry.status === 'Processed' || entry.status === 'Failed'
    );

  beforeAll(async () => {
    app = await createApp();
    auth = await admin(app);
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('processes the submitted lines, skipping the blank ones', async () => {
    const response = await request('POST', '/inbox', {
      lines: [`Urgent: the invoice ${RUN} is broken`, '   ']
    });

    expect(response.statusCode).toBe(202);
    const [entry, ...rest] = response.json().entries;
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({ source: 'Api', status: 'Pending' });

    expect(await settled(entry.id)).toMatchObject({
      status: 'Processed',
      attempts: 1,
      words: 6,
      normalized: `urgent the invoice ${RUN} is broken`,
      tags: ['bug', 'invoice', 'urgent']
    });
    expect(fs.readFileSync(inboxConfig.OUTBOX_PATH, 'utf8')).toContain(
      `#${entry.id} `
    );
  });

  test('fails a rejected line at once, and retries any other error', async () => {
    const [rejected, flaky] = await submit('! not this one', '? how come');

    expect(await settled(rejected.id)).toMatchObject({
      status: 'Failed',
      attempts: 1,
      error: 'A line starting with "!" is rejected'
    });
    expect(await settled(flaky.id)).toMatchObject({
      status: 'Processed',
      attempts: 2,
      tags: ['question'],
      error: null
    });
  });

  test('validates the submitted lines', async () => {
    const response = await request('POST', '/inbox', { lines: [] });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_FAILED');
  });

  test('counts the entries by status', async () => {
    const response = await request('GET', '/inbox/stats');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      Pending: expect.any(Number),
      Processing: expect.any(Number),
      Processed: expect.any(Number),
      Failed: expect.any(Number)
    });
    expect(response.json().Failed).toBeGreaterThanOrEqual(1);
  });

  test('lets anyone query the entries, but not write them', async () => {
    const query = await request('POST', '/entries/query', {
      filter: { status: 'Failed' }
    });
    expect(query.statusCode).toBe(200);
    expect(query.json().items.length).toBeGreaterThanOrEqual(1);

    const create = await request('POST', '/entries', { text: 'Direct' });
    expect(create.statusCode).toBe(404);
  });

  describe('retry', () => {
    test('queues a failed entry again, for an admin', async () => {
      const [entry] = await submit('! rejected again');
      await settled(entry.id);

      expect(
        (await request('POST', `/entries/${entry.id}/retry`)).statusCode
      ).toBe(401);

      const retried = await request(
        'POST',
        `/entries/${entry.id}/retry`,
        undefined,
        auth
      );
      expect(retried.statusCode).toBe(202);
      expect(retried.json()).toMatchObject({
        status: 'Pending',
        attempts: 0,
        error: null
      });
      expect(await settled(entry.id)).toMatchObject({
        status: 'Failed',
        attempts: 1
      });
    });

    test('refuses an entry that has not failed, or does not exist', async () => {
      const [entry] = await submit('Processed fine');
      await settled(entry.id);

      const processed = await request(
        'POST',
        `/entries/${entry.id}/retry`,
        undefined,
        auth
      );
      expect(processed.statusCode).toBe(409);
      expect(processed.json().code).toBe('ENTRY_NOT_FAILED');

      const missing = await request(
        'POST',
        '/entries/999999/retry',
        undefined,
        auth
      );
      expect(missing.statusCode).toBe(404);
    });
  });

  describe('scan', () => {
    test('submits the complete lines appended to the inbox file', async () => {
      fs.appendFileSync(
        inboxConfig.FILE_PATH,
        `From the file ${RUN}\nMeeting about it ${RUN}\nnot finished yet`
      );

      const scan = () => request('POST', '/inbox/scan', undefined, auth);
      expect((await scan()).json()).toEqual({ submitted: 2 });
      expect((await scan()).json()).toEqual({ submitted: 0 });

      // The line being written waits for its line break
      fs.appendFileSync(inboxConfig.FILE_PATH, '\n');
      expect((await scan()).json()).toEqual({ submitted: 1 });

      const entries = await db.entry.findMany({
        where: { source: 'File', text: { contains: RUN } }
      });
      expect(entries.map((entry) => entry.text).sort()).toEqual([
        `From the file ${RUN}`,
        `Meeting about it ${RUN}`
      ]);
    });

    test('is for an admin only', async () => {
      expect((await request('POST', '/inbox/scan')).statusCode).toBe(401);
    });
  });
});
