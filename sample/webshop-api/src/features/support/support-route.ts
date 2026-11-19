import { Type } from '@sinclair/typebox';
import { ErrorCode } from '@appweaver/common';
import { AiPrompt, AiService, aiEventStream } from '@appweaver/ai';
import { currentAuthUser, inject } from '@appweaver/core';
import { errorResponses, registerModel, registerRoute } from '@appweaver/web';
import { Role } from '@/features/access/roles';
import { getOrder, listMyOrders, searchProducts } from './support-tools';

registerModel(
  Type.Object(
    {
      message: Type.String({
        minLength: 1,
        maxLength: 2000,
        example: 'Where is my order WS-2026-000042?'
      }),
      // The earlier turns, kept by the client, the server stores no chat
      history: Type.Optional(
        Type.Array(
          Type.Object({
            role: Type.Union([Type.Literal('user'), Type.Literal('assistant')]),
            content: Type.String({ maxLength: 4000 })
          }),
          { maxItems: 20 }
        )
      )
    },
    { $id: 'SupportChatRequest' }
  )
);

type SupportChatRequest = {
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
};

const aiErrors = errorResponses(
  ErrorCode.AiRateLimited,
  ErrorCode.AiTimeout,
  ErrorCode.AiProviderUnavailable,
  ErrorCode.AiContextLengthExceeded
);

/** The prompt of the support assistant, the system prompt rendered from `templates/prompts/support.md.hbs`. */
function supportPrompt(
  { message, history = [] }: SupportChatRequest,
  signal?: AbortSignal
): AiPrompt {
  const customer = currentAuthUser() as
    | { firstName?: string; language?: string }
    | undefined;
  return {
    model: 'support',
    system: {
      template: 'prompts/support',
      data: {
        firstName: customer?.firstName,
        language: customer?.language ?? 'en',
        today: new Date().toISOString().slice(0, 10)
      }
    },
    messages: history,
    prompt: message,
    tools: [listMyOrders, getOrder, searchProducts],
    temperature: 0.2,
    signal
  };
}

registerRoute(
  (router) => {
    router.post(
      '/support/chat',
      {
        schema: {
          tags: ['Support'],
          summary: 'Ask the support assistant',
          description:
            'An AI assistant answering about the orders of the customer and the catalog, looking them up with its tools.',
          body: Type.Ref('SupportChatRequest'),
          response: {
            200: Type.Object({
              answer: Type.String(),
              // The tools the assistant called, i.e. to show what it looked up
              tools: Type.Array(Type.String())
            }),
            ...aiErrors
          }
        }
      },
      async (req) => {
        const result = await inject(AiService).generate(
          supportPrompt(req.body as SupportChatRequest)
        );
        return {
          answer: result.text,
          tools: result.steps.flatMap((step) =>
            step.response.toolCalls.map((call) => call.name)
          )
        };
      }
    );

    router.post(
      '/support/chat/stream',
      {
        schema: {
          tags: ['Support'],
          summary: 'Ask the support assistant, streaming the answer',
          description:
            'The answer as Server-Sent Events: a `text-delta` event per chunk, a `tool-call` and a `tool-result` per lookup, then `finish`, or `error`.',
          body: Type.Ref('SupportChatRequest'),
          produces: ['text/event-stream'],
          response: aiErrors
        }
      },
      async (req, reply) => {
        const abort = new AbortController();
        req.raw.once('close', () => abort.abort());
        const stream = inject(AiService).stream(
          supportPrompt(req.body as SupportChatRequest, abort.signal)
        );
        reply.header('content-type', 'text/event-stream');
        return reply.send(aiEventStream(stream));
      }
    );
  },
  {
    roles: [Role.Customer],
    // Every message costs tokens
    rateLimit: { max: 20, timeWindow: '1 minute' }
  }
);
