import { Application, createApp, injectService } from '@appweaver/core';
import { resetTestData } from './support/reset';

/**
 * Reads a category over its route, so the ancestor chain of the response is
 * written by the real response serializer. The chain is a self reference the
 * serializer follows back into the same model, which the flat schema of a
 * single category would not prove.
 */
describe('Category tree output', () => {
  let app: Application;
  let categories: any;
  let leafId: number;

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    categories = injectService('Category');

    await categories.client.deleteMany({});

    const travel = await categories.create({ name: 'Travel', slug: 'travel' });
    const guides = await categories.create({
      name: 'Guides',
      slug: 'guides',
      parent: travel.id
    });
    const leaf = await categories.create({
      name: 'Trail guides',
      slug: 'trail-guides',
      parent: guides.id
    });
    leafId = leaf.id;
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('returns the ancestors of a category', async () => {
    const resp = await app.server.inject({
      method: 'GET',
      url: `/api/categories/${leafId}`
    });

    expect(resp.statusCode).toBe(200);
    const category = resp.json();
    expect(category.slug).toBe('trail-guides');
    expect(category.parent.slug).toBe('guides');
    expect(category.parent.parent.slug).toBe('travel');
    expect(category.parent.parent.parent).toBeNull();
  });

  test('counts the children instead of listing them', async () => {
    const resp = await app.server.inject({
      method: 'POST',
      url: '/api/categories/query',
      payload: { filter: { slug: 'travel' } }
    });

    expect(resp.statusCode).toBe(200);
    const [category] = resp.json().items;
    expect(category.childrenCount).toBe(1);
    expect(category.children).toBeUndefined();
  });

  test('documents the parent as the category schema itself', async () => {
    const document = JSON.parse(await app.spec('json'));
    const schemas: Record<string, any> = document.components.schemas;

    // The schemas are documented under generated names, holding the model name
    const named = Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [
        schema.title ?? name,
        name
      ])
    );

    const parent = schemas[named.CategorySingle].properties.parent;
    expect(parent.anyOf[0].$ref).toBe(
      `#/components/schemas/${named.CategorySingle}`
    );
    expect(parent.anyOf[1]).toEqual({ type: 'null' });
    // The nullable variants the response serializer needs stay internal
    expect(Object.keys(named)).not.toContain('CategorySingleNullable');
  });
});
