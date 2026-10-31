import { createHash } from 'node:crypto';
import { ApplicationError } from '@appweaver/common';
import { InboxErrors } from './errors';

/** The results of the analysis of a line. */
export type Analysis = {
  words: number;
  /** The first 16 characters of the SHA-256 of the normalized text. */
  checksum: string;
  /** The text in lowercase, with single spaces and without punctuation. */
  normalized: string;
  /** The keywords found in the text, sorted. */
  tags: string[];
};

/** The tags, by the words marking them. */
const keywords: Record<string, string[]> = {
  urgent: ['urgent', 'asap', 'immediately', 'critical'],
  invoice: ['invoice', 'payment', 'paid', 'refund'],
  bug: ['bug', 'error', 'crash', 'broken'],
  meeting: ['meeting', 'call', 'tomorrow', 'schedule'],
  question: ['how', 'why', 'what', 'when']
};

/**
 * Analyses a line of text: counts its words, normalizes it, finds the tags of its keywords, and calculates a
 * checksum of the normalized text, the same for two lines differing only in case, spacing and punctuation.
 *
 * @param {string} text - The line.
 * @return {Analysis} The results.
 * @throws {ApplicationError} With the `LINE_REJECTED` code for a line starting with `!` or without any word, which
 * is never retried.
 */
export function analyze(text: string): Analysis {
  if (text.trimStart().startsWith('!')) {
    throw new ApplicationError(
      InboxErrors.LineRejected,
      'A line starting with "!" is rejected',
      { text }
    );
  }

  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    throw new ApplicationError(
      InboxErrors.LineRejected,
      'The line has no words',
      { text }
    );
  }

  const words = normalized.split(' ');
  const tags = Object.entries(keywords)
    .filter(([, marks]) => marks.some((mark) => words.includes(mark)))
    .map(([tag]) => tag)
    .sort();

  return {
    words: words.length,
    checksum: createHash('sha256')
      .update(normalized)
      .digest('hex')
      .slice(0, 16),
    normalized,
    tags
  };
}
