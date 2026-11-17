import { Type } from '@sinclair/typebox';
import { createChannel } from '@appweaver/realtime';

const movieChatParams = Type.Object({
  movieId: Type.String({ description: 'The movie whose chat to follow' })
});

// Every viewer of a movie page follows the chat of that movie only
const sameMovie = (
  _: unknown,
  payload: { movieId: string },
  params: { movieId: string }
) => payload.movieId === params.movieId;

/**
 * The messages of the live chat of a movie page. Public like the catalog, so
 * a visitor without an account reads along, while sending needs one.
 */
export const chatMessages = createChannel({
  name: 'movie.chat',
  description: 'The messages of the live chat of a movie page',
  public: true,
  payload: Type.Object({
    movieId: Type.String(),
    messageId: Type.String(),
    authorName: Type.String(),
    text: Type.String(),
    sentAt: Type.String({ description: 'When it was sent, in ISO 8601' })
  }),
  params: movieChatParams,
  deliver: sameMovie
});

/** Who is typing in the live chat of a movie page. */
export const chatTyping = createChannel({
  name: 'movie.typing',
  description: 'The members typing in the live chat of a movie page',
  public: true,
  payload: Type.Object({
    movieId: Type.String(),
    authorName: Type.String()
  }),
  params: movieChatParams,
  deliver: sameMovie
});
