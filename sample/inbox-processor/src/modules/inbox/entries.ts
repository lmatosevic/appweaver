import {
  ApplicationError,
  ErrorCode,
  Queue,
  ResourceError
} from '@appweaver/common';
import { inject } from '@appweaver/core';
import db from '@db/client';
import { Entry } from '@/types';
import { inboxConfig } from './config';
import { InboxErrors } from './errors';

/** The job of an entry waiting to be processed. */
export type EntryJob = { entryId: number };

export type EntryStatus = Entry['status'];

/** The queue of the entries, BullMQ on Redis in development and production, in memory for the tests. */
export function entryQueue() {
  return inject(Queue).get<EntryJob, void>('entries');
}

/**
 * Records the lines as pending entries and queues them, every line in an entry of its own. The blank lines are
 * skipped.
 *
 * @param {string[]} lines - The lines of text.
 * @param {Entry['source']} source - Where the lines come from.
 * @return {Promise<Entry[]>} The entries, in the order of the lines.
 */
export async function submitLines(
  lines: string[],
  source: Entry['source']
): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (const line of lines) {
    const text = line.trim().slice(0, 2000);
    if (!text) {
      continue;
    }
    entries.push(await db.entry.create({ data: { text, source } }));
  }

  await entryQueue().sendBulkJobs(
    entries.map((entry) => ({
      data: { entryId: entry.id },
      name: 'process',
      options: jobOptions()
    }))
  );
  return entries;
}

/**
 * Queues a failed entry again, with all of its attempts.
 *
 * @param {number} id - The id of the entry.
 * @return {Promise<Entry>} The entry, pending again.
 * @throws {ResourceError} When there is no such entry.
 * @throws {ApplicationError} With the `ENTRY_NOT_FAILED` code when the entry has not failed.
 */
export async function retryEntry(id: number): Promise<Entry> {
  const entry = await db.entry.findUnique({ where: { id } });
  if (!entry) {
    throw new ResourceError(
      ErrorCode.ResourceNotFound,
      `Entry ${id} not found`,
      { model: 'Entry', id }
    );
  }
  if (entry.status !== 'Failed') {
    throw new ApplicationError(
      InboxErrors.EntryNotFailed,
      `Entry ${id} is ${entry.status}, only a failed entry is retried`,
      { id, status: entry.status }
    );
  }

  const pending = await db.entry.update({
    where: { id },
    data: { status: 'Pending', attempts: 0, error: null }
  });
  await entryQueue().sendJob({ entryId: id }, 'process', jobOptions());
  return pending;
}

/** Counts the entries by status, every status included. */
export async function countEntries(): Promise<Record<EntryStatus, number>> {
  const groups = await db.entry.groupBy({ by: ['status'], _count: true });
  const counts: Record<EntryStatus, number> = {
    Pending: 0,
    Processing: 0,
    Processed: 0,
    Failed: 0
  };
  for (const group of groups) {
    counts[group.status] = group._count;
  }
  return counts;
}

function jobOptions() {
  return {
    attempts: inboxConfig.MAX_ATTEMPTS,
    backoff: { type: 'fixed' as const, delay: inboxConfig.RETRY_DELAY }
  };
}
