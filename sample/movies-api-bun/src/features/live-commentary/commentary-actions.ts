import { Type } from '@sinclair/typebox';
import { injectService } from '@appweaver/core';
import { createRealtimeAction } from '@appweaver/realtime';
import { catalogEditors } from '../access/roles';
import { commentaryNote, movieCommentary } from './commentary-stream';

/**
 * Broadcasts the live commentary of a curator: the notes the curator streams
 * to the action, over the WebSocket, are passed on to every viewer of the
 * movie page. The call lasts as long as the commentary, and answers with the
 * number of notes once the curator ends it.
 */
export const broadcastCommentary = createRealtimeAction({
  name: 'commentary.broadcast',
  description:
    'Streams the live commentary of a curator to the viewers of a movie page',
  roles: catalogEditors,
  payload: Type.Object({ movieId: Type.String() }),
  response: Type.Object({ notes: Type.Integer() }),
  input: { codec: 'json', chunk: commentaryNote, maxBytes: '1MB' },
  handler: async ({ movieId }, { input }) => {
    // Fails with RESOURCE_NOT_FOUND before a stream is opened for nothing
    await injectService('Movie').find(movieId);

    const writer = movieCommentary.open(movieId);
    let notes = 0;
    try {
      for await (const note of input!) {
        writer.write(note);
        notes++;
        // Paces the curator to the slowest viewer of this instance
        await writer.ready;
      }
      writer.end({ notes });
    } catch (e) {
      // The curator cancelled, disconnected, or lost the role: the viewers
      // see the commentary end with the error, the call is over already
      writer.error(e);
    }

    return { notes };
  }
});
