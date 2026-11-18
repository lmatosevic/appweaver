/** A request the fake server received. */
export type FakeRequest = { method: string; path: string; body: any };

/** An answer the next request receives instead of the default one. */
export type FakeAnswer = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * A fake OpenAI-compatible server behind a mocked `fetch`: a request with tools is answered with a call of the
 * `lookup` tool, a JSON one with a JSON object, any other one with a text, streamed as Server-Sent Events on request.
 */
export class FakeServer {
  requests: FakeRequest[] = [];
  answers: FakeAnswer[] = [];
  /** The deltas of the next streamed response, instead of the default ones */
  chunks?: unknown[];

  fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const body =
      typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const request = { method: init?.method ?? 'GET', path: url.pathname, body };
    this.requests.push(request);
    init?.signal?.throwIfAborted();

    const answer = this.answers.shift();
    if (answer) {
      return new Response(JSON.stringify(answer.body ?? {}), {
        status: answer.status,
        headers: { 'content-type': 'application/json', ...answer.headers }
      });
    }
    if (url.pathname.endsWith('/models')) {
      return json({ object: 'list', data: [{ id: 'test', object: 'model' }] });
    }
    if (url.pathname.endsWith('/embeddings')) {
      return json({
        object: 'list',
        model: body.model,
        data: body.input
          .map((_: string, index: number) => ({
            object: 'embedding',
            index,
            embedding: [index, 0.5, 1]
          }))
          .reverse(),
        usage: { prompt_tokens: 4, total_tokens: 4 }
      });
    }
    return body.stream ? this.stream(body) : json(this.completion(body));
  });

  /** The last request of a path. */
  last(path = '/chat/completions'): FakeRequest {
    return this.requests
      .filter((request) => request.path.endsWith(path))
      .at(-1)!;
  }

  private completion(body: any) {
    const toolCall = body.tools?.length && body.tool_choice !== 'none';
    const message = toolCall
      ? {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'lookup', arguments: '{"word":"cat"}' }
            }
          ]
        }
      : {
          role: 'assistant',
          content: body.response_format ? '{"answer":"yes"}' : 'Hello!',
          reasoning_content: 'Thinking'
        };
    return {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1,
      model: `${body.model}-0001`,
      choices: [
        { index: 0, message, finish_reason: toolCall ? 'tool_calls' : 'stop' }
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 3,
        total_tokens: 15,
        prompt_tokens_details: { cached_tokens: 4 },
        completion_tokens_details: { reasoning_tokens: 2 }
      }
    };
  }

  private stream(body: any): Response {
    const toolCall = body.tools?.length && body.tool_choice !== 'none';
    const deltas =
      this.chunks ??
      (toolCall
        ? [
            {
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'look', arguments: '{"wo' }
                  }
                ]
              }
            },
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { name: 'up', arguments: 'rd":"cat"}' }
                  }
                ]
              }
            },
            { delta: {}, finish_reason: 'tool_calls' }
          ]
        : [
            { delta: { role: 'assistant', reasoning: 'Hmm' } },
            { delta: { content: 'Hel' } },
            { delta: { content: 'lo!' } },
            { delta: {}, finish_reason: 'stop' }
          ]);
    this.chunks = undefined;
    const events = deltas.map((choice) => ({
      id: 'chatcmpl-2',
      object: 'chat.completion.chunk',
      created: 1,
      model: body.model,
      choices: [{ index: 0, ...(choice as object) }]
    }));
    if (body.stream_options?.include_usage) {
      events.push({
        id: 'chatcmpl-2',
        object: 'chat.completion.chunk',
        created: 1,
        model: body.model,
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
      } as any);
    }
    const text =
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') +
      'data: [DONE]\n\n';
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    });
  }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}
