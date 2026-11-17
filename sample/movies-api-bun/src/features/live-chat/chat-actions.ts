import { randomUUID } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import { AuthUser, ErrorCode, ResourceError } from '@appweaver/common';
import { createRealtimeAction } from '@appweaver/realtime';
import db from '@db/client';
import { chatMessages, chatTyping } from './chat-channels';

/**
 * Sends a message to the live chat of a movie, answering with its ID once
 * every viewer got it. Nothing is stored: a viewer sees the messages sent
 * while connected, like a premiere watch party.
 */
export const sendChatMessage = createRealtimeAction({
  name: 'chat.send',
  description: 'Sends a message to the live chat of a movie page',
  payload: Type.Object({
    movieId: Type.String(),
    // At least one character that is not a space
    text: Type.String({ minLength: 1, maxLength: 500, pattern: '\\S' })
  }),
  response: Type.Object({
    messageId: Type.String(),
    sentAt: Type.String({ description: 'When it was sent, in ISO 8601' })
  }),
  handler: async ({ movieId, text }, { user }) => {
    const movie = await db.movie.findUnique({
      where: { id: movieId },
      select: { id: true }
    });
    if (!movie) {
      throw new ResourceError(ErrorCode.ResourceNotFound, 'Movie not found', {
        model: 'Movie',
        id: movieId
      });
    }

    const message = {
      movieId,
      messageId: randomUUID(),
      authorName: authorName(user),
      text: text.trim(),
      sentAt: new Date().toISOString()
    };
    await chatMessages.publish(message);

    return { messageId: message.messageId, sentAt: message.sentAt };
  }
});

/**
 * Shows the member as typing. Called fire-and-forget by the clients, since a
 * lost typing indicator does no harm.
 */
export const typeChatMessage = createRealtimeAction({
  name: 'chat.typing',
  description: 'Shows the member as typing in the live chat of a movie page',
  payload: Type.Object({ movieId: Type.String() }),
  handler: ({ movieId }, { user }) =>
    chatTyping.publish({ movieId, authorName: authorName(user) })
});

// The display name, never the email, like the authors of the reviews
function authorName(user: AuthUser | null): string {
  return (user as { displayName?: string } | null)?.displayName ?? 'Anonymous';
}
