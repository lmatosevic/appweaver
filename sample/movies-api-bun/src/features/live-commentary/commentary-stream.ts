import { Type } from '@sinclair/typebox';
import { createStream } from '@appweaver/realtime';

/** A note of a commentary, at a moment of the movie. */
export const commentaryNote = Type.Object({
  at: Type.Integer({
    minimum: 0,
    description: 'The moment of the movie, in seconds from its start'
  }),
  text: Type.String({ minLength: 1, maxLength: 1000 })
});

/**
 * The live commentary of a curator on a movie page, like the commentary track
 * of a disc, written once and sent to every viewer of the page. Its key is the
 * ID of the movie, and a viewer is checked once when they subscribe, never per
 * note.
 */
export const movieCommentary = createStream({
  name: 'movie.commentary',
  description: 'The live commentary of a curator, to every viewer of a movie',
  codec: 'json',
  chunk: commentaryNote,
  // Public like the catalog: anyone able to read the movie, by its policy.
  // The ID is the key as is, a string even when its characters are digits.
  public: true,
  resource: { model: 'Movie', id: (key) => key },
  // A viewer opening the page late reads the notes already given
  replay: { from: 'all', maxBytes: '64KB' }
});
