import { AiModelRequest, mockAiResponse } from '@appweaver/ai';
import { Application, createApp } from '@appweaver/core';
import { resetTestData } from './support/reset';
import {
  ADDRESS,
  createRoles,
  product,
  registerCustomer,
  request,
  RUN
} from './support/fixtures';

/**
 * The AI support assistant over HTTP, on the `mock` model of the test
 * environment scripted to call a tool and answer with its result: the system
 * prompt rendered from its template, the tools running as the customer, so
 * the policies keep them to their own orders and the active products, and the
 * answer streamed as Server-Sent Events.
 */
describe('Support chat', () => {
  let app: Application;
  let customer: Awaited<ReturnType<typeof registerCustomer>>;
  let other: Awaited<ReturnType<typeof registerCustomer>>;
  let orderNumber: string;
  let requests: AiModelRequest[];

  /** Answers like a model would: calls the tool once, then answers with the result it got. */
  const scriptModel = (tool: string, args: object) =>
    mockAiResponse((req) => {
      requests.push(req);
      const last = req.messages[req.messages.length - 1];
      if (last.role !== 'tool') {
        return {
          toolCalls: [{ id: 'call_1', name: tool, arguments: args }]
        };
      }
      const [{ result }] = last.content;
      return typeof result === 'string' ? result : JSON.stringify(result);
    });

  const chat = (
    headers: Record<string, string>,
    message: string,
    history?: object[]
  ) =>
    request(app, 'POST', '/support/chat', {
      headers,
      payload: { message, history }
    });

  beforeAll(async () => {
    app = await createApp();
    await createRoles();
    customer = await registerCustomer(app, 'Olivia');
    other = await registerCustomer(app, 'Daniel');
    const speaker = await product('SPEAKER', 4999, 5);
    const placed = await request(app, 'POST', '/checkout', {
      headers: customer.auth,
      payload: {
        items: [{ product: speaker.id, quantity: 2 }],
        shippingAddress: ADDRESS
      }
    });
    orderNumber = placed.body.number;
  }, 30_000);

  beforeEach(() => {
    requests = [];
  });

  afterEach(() => {
    mockAiResponse(undefined);
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('looks up an order of the customer with its lines', async () => {
    scriptModel('getOrder', { number: orderNumber });

    const { status, body } = await chat(
      customer.auth,
      `Where is my order ${orderNumber}?`
    );

    expect(status).toBe(200);
    expect(body.tools).toEqual(['getOrder']);
    const order = JSON.parse(body.answer);
    expect(order).toMatchObject({
      number: orderNumber,
      total: expect.any(Number),
      lines: [
        {
          product: `Product SPEAKER-${RUN.toUpperCase()}`,
          quantity: 2,
          unitPrice: 4999,
          lineTotal: 9998
        }
      ]
    });
  });

  test('renders the system prompt for the customer, and continues the history', async () => {
    scriptModel('listMyOrders', {});

    await chat(customer.auth, 'And my other orders?', [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello, how can I help?' }
    ]);

    const [first] = requests;
    expect(first.model).toBe('echo');
    expect(first.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('Olivia, a signed-in customer')
    });
    expect(first.messages.slice(1).map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user'
    ]);
    expect(first.tools!.map((tool) => tool.name).sort()).toEqual([
      'getOrder',
      'listMyOrders',
      'searchProducts'
    ]);
  });

  test('never finds the order of another customer', async () => {
    scriptModel('getOrder', { number: orderNumber });

    const { body } = await chat(other.auth, `Where is ${orderNumber}?`);

    expect(body.answer).toBe(
      `No order ${orderNumber} found for this customer.`
    );
  });

  test('searches only the active products of the catalog', async () => {
    await product('TURNTABLE', 29999, 0);
    await product('TURNTABLE-DRAFT', 39999, 3, 'Draft');
    scriptModel('searchProducts', { query: `turntable` });

    const { body } = await chat(customer.auth, 'Do you sell turntables?');

    const found = JSON.parse(body.answer);
    expect(found.map((item: any) => item.sku)).toEqual([
      `TURNTABLE-${RUN}`.toUpperCase()
    ]);
    expect(found[0]).toMatchObject({ price: 29999, inStock: false });
  });

  test('streams the answer as Server-Sent Events', async () => {
    scriptModel('listMyOrders', { limit: 1 });

    const response = await app.server.inject({
      method: 'POST',
      url: '/api/support/chat/stream',
      headers: customer.auth,
      payload: { message: 'What did I order last?' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    const events = [...response.body.matchAll(/^event: (.+)$/gm)].map(
      (match) => match[1]
    );
    expect(events[0]).toBe('tool-call');
    expect(events).toContain('tool-result');
    expect(events).toContain('text-delta');
    expect(events.at(-1)).toBe('finish');
    expect(response.body).toContain(orderNumber);
  });

  test('is for signed-in customers only', async () => {
    const { status } = await chat({}, 'Hello?');

    expect(status).toBe(401);
  });
});
