import fsp from 'node:fs/promises';
import { createLogger } from '@appweaver/common';
import db from '@db/client';
import { InboxErrors } from './errors';
import { analyze } from './analyze';
import { inboxConfig } from './config';

const logger = createLogger('inbox');

/**
 * Processes an entry: analyses its text, stores the results and appends them to the outbox file. A rejected line
 * fails at once. Any other error is thrown, so the queue attempts the entry again, until its last attempt fails it.
 * A line starting with `?` fails its first attempt, showing a retry.
 *
 * @param {number} entryId - The id of the entry.
 */
export async function processEntry(entryId: number): Promise<void> {
  const entry = await db.entry.findUnique({ where: { id: entryId } });
  if (!entry || entry.status === 'Processed' || entry.status === 'Failed') {
    return;
  }

  const attempts = entry.attempts + 1;
  await db.entry.update({
    where: { id: entryId },
    data: { status: 'Processing', attempts }
  });

  try {
    if (entry.text.startsWith('?') && attempts === 1) {
      throw new Error('Simulated failure of a first attempt');
    }

    const { words, checksum, normalized, tags } = analyze(entry.text);
    await db.entry.update({
      where: { id: entryId },
      data: {
        status: 'Processed',
        words,
        checksum,
        normalized,
        tags,
        error: null,
        processedAt: new Date()
      }
    });
    await fsp.appendFile(
      inboxConfig.OUTBOX_PATH,
      `#${entryId} ${checksum} words=${words} tags=${tags.join(',') || '-'} ${normalized}\n`
    );
  } catch (e) {
    const error = (e as Error).message;
    const rejected = (e as { code?: string }).code === InboxErrors.LineRejected;
    const final = rejected || attempts >= inboxConfig.MAX_ATTEMPTS;
    await db.entry.update({
      where: { id: entryId },
      data: { status: final ? 'Failed' : 'Pending', error }
    });

    if (final) {
      logger.warn({ entryId, attempts, error }, 'Entry failed');
      return;
    }
    throw e;
  }
}
