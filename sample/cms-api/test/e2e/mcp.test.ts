import { configOverrides } from '@appweaver/common';
import { Application, createApp, injectService } from '@appweaver/core';
import { hashPassword } from '@appweaver/data';
import { resetTestData } from './support/reset';

/**
 * Exercises the MCP server of the AI agents against the real database: an
 * agent connects with the API key of a user, sees only the tools that user may
 * call, and reads and writes the posts, the tags and the comments as that user.
 */
describe('MCP server', () => {
  let app: Application;
  let posts: any;
  let users: any;
  let adminKey: string;
  let authorKey: string;
  let rpcId = 0;

  /** Sends a JSON-RPC request to the MCP endpoint, as an agent would. */
  const rpc = async (
    method: string,
    params: object | undefined,
    headers: Record<string, string>
  ) => {
    const response = await app.server.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'content-type': 'application/json', ...headers },
      payload: { jsonrpc: '2.0', id: ++rpcId, method, params }
    });
    return { status: response.statusCode, body: response.json() };
  };

  const listTools = async (apiKey: string): Promise<string[]> =>
    (await rpc('tools/list', {}, { 'x-api-key': apiKey })).body.result.tools
      .map((tool: { name: string }) => tool.name)
      .sort();

  const callTool = async (apiKey: string, name: string, args: object = {}) =>
    (
      await rpc(
        'tools/call',
        { name, arguments: args },
        { 'x-api-key': apiKey }
      )
    ).body.result;

  /** Creates a user of the role, signs in and creates its API key, the credential an agent is given. */
  const createApiKey = async (role: string): Promise<string> => {
    const email = `mcp-${role.toLowerCase()}@example.com`;
    const password = 'McpServer!Pass1';
    await users.client.create({
      data: {
        firstName: 'Mcp',
        lastName: role,
        email,
        phone: role === 'Admin' ? '+38512345681' : '+38512345682',
        passwordHash: await hashPassword(password),
        roles: {
          connectOrCreate: { where: { name: role }, create: { name: role } }
        }
      }
    });
    const login = await app.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: email, password }
    });
    const created = await app.server.inject({
      method: 'POST',
      url: '/api/api-keys',
      headers: { authorization: `Bearer ${login.json().accessToken}` },
      payload: { name: 'Claude' }
    });
    const { key } = created.json();
    // The id, the delimiter, then letters and digits only
    expect(key).toMatch(/^\d+AK[A-Za-z0-9]{64}$/);
    return key;
  };

  beforeAll(async () => {
    // The login route would otherwise verify a reCAPTCHA token with Google
    configOverrides.SECURITY_RECAPTCHA_ENABLED = false;
    app = await createApp();
    posts = injectService('Post');
    users = injectService('User');
    adminKey = await createApiKey('Admin');
    authorKey = await createApiKey('User');
  }, 30_000);

  afterAll(async () => {
    await app.stop();
    delete configOverrides.SECURITY_RECAPTCHA_ENABLED;
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await posts.client.updateMany({ data: { pinnedCommentId: null } });
    await injectService('Comment').client.deleteMany({});
    await posts.client.deleteMany({});
  });

  test('introduces the server with the instructions of the config', async () => {
    const { body } = await rpc(
      'initialize',
      {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' }
      },
      { 'x-api-key': authorKey }
    );

    expect(body.result.serverInfo.name).toBe('CMS API');
    expect(body.result.instructions).toContain('The CMS of a blog');
  });

  test('refuses an agent without credentials', async () => {
    const { status } = await rpc('tools/list', {}, {});

    expect(status).toBe(401);
  });

  test('lists only the tools the user may call', async () => {
    const author = await listTools(authorKey);
    const admin = await listTools(adminKey);

    expect(author).toEqual([
      'category_find',
      'category_query',
      'comment_find',
      'comment_query',
      'post_create',
      'post_find',
      'post_query',
      'post_update',
      'tag_create',
      'tag_find',
      'tag_query'
    ]);
    expect(admin).toEqual(
      expect.arrayContaining([
        'comment_update',
        'post_aggregate',
        'publishScheduledPosts'
      ])
    );
  });

  test('writes a post as its author, reusing a tag by its slug', async () => {
    await callTool(authorKey, 'tag_create', { name: 'Hiking', slug: 'hiking' });

    const created = await callTool(authorKey, 'post_create', {
      title: 'Mountain huts',
      slug: 'mountain-huts',
      tags: [
        { name: 'Hiking', slug: 'hiking' },
        { name: 'Huts', slug: 'huts' }
      ]
    });

    expect(created.isError).toBeFalsy();
    const post = created.structuredContent;
    expect(post).toMatchObject({ status: 'Draft', slug: 'mountain-huts' });
    expect(post.author.email).toBe('mcp-user@example.com');
    expect(post.tags.map((tag: any) => tag.slug).sort()).toEqual([
      'hiking',
      'huts'
    ]);
    expect(post).not.toHaveProperty('seo');

    const updated = await callTool(authorKey, 'post_update', {
      id: post.id,
      data: { status: 'Published' }
    });
    expect(updated.structuredContent.publishedAt).toEqual(expect.any(String));
  });

  test('queries the posts with a filter and a sort', async () => {
    for (const slug of ['first', 'second', 'third']) {
      await posts.create({
        title: `Post ${slug}`,
        slug,
        status: slug === 'second' ? 'Draft' : 'Published'
      });
    }

    const result = await callTool(authorKey, 'post_query', {
      filter: { status: 'Published' },
      sort: { slug: 'desc' }
    });

    expect(
      result.structuredContent.items.map((post: any) => post.slug)
    ).toEqual(['third', 'first']);
  });

  test('publishes the scheduled posts as an admin', async () => {
    await posts.create({
      title: 'Scheduled',
      slug: 'scheduled',
      publishedAt: new Date(Date.now() - 60_000)
    });

    const result = await callTool(adminKey, 'publishScheduledPosts');

    expect(result.structuredContent).toMatchObject({
      published: 1,
      latest: { slug: 'scheduled' }
    });
  });

  test('moderates a comment without exposing the email of the guest', async () => {
    const post = await posts.create({ title: 'Commented', slug: 'commented' });
    const comment = await injectService('Comment').create({
      body: 'Great read!',
      guestName: 'Ana',
      guestEmail: 'ana@example.com',
      post: post.id
    });

    const result = await callTool(adminKey, 'comment_update', {
      id: comment.id,
      data: { status: 'Approved' }
    });

    expect(result.structuredContent.status).toBe('Approved');
    expect(result.structuredContent).not.toHaveProperty('guestEmail');
  });

  test('denies a tool the user may not call', async () => {
    const { body } = await rpc(
      'tools/call',
      { name: 'publishScheduledPosts', arguments: {} },
      { 'x-api-key': authorKey }
    );

    expect(body.error.code).toBe(-32602);
  });
});
