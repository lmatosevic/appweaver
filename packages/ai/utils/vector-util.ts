/**
 * Returns the cosine similarity of two vectors, i.e. of the embeddings of two texts: `1` for the same direction, `0`
 * for unrelated ones.
 *
 * @param {number[]} a - The first vector.
 * @param {number[]} b - The second vector, of the same length.
 * @return {number} The similarity, from `-1` to `1`, `0` for a zero vector.
 * @throws {RangeError} For vectors of different lengths.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new RangeError(
      `The vectors have different lengths, ${a.length} and ${b.length}`
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/**
 * Ranks items by the similarity of their vectors to a query vector, i.e. the documents closest to the embedding of a
 * question.
 *
 * @param {number[]} query - The query vector.
 * @param {T[]} items - The items.
 * @param {Function} vector - Returns the vector of an item.
 * @param {number} [limit] - The number of items to return. Default: all of them.
 * @return {{ item: T; score: number }[]} The items with their similarity, the most similar first.
 */
export function rankBySimilarity<T>(
  query: number[],
  items: T[],
  vector: (item: T) => number[],
  limit: number = items.length
): { item: T; score: number }[] {
  return items
    .map((item) => ({ item, score: cosineSimilarity(query, vector(item)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
