import { Application, createApp } from '@appweaver/core';
import { resetTestData } from './support/reset';
import { createRoles, hire, signIn } from './support/fixtures';

/** The directory every employee can browse, searched by the text search. */
describe('Employee directory', () => {
  let app: Application;
  let auth: Record<string, string>;
  let target: any;

  const search = async (searchText: string) => {
    const response = await app.server.inject({
      method: 'POST',
      url: '/api/employees/query',
      headers: auth,
      payload: { filter: { searchText } }
    });
    return response.json().items.map((item: any) => item.id);
  };

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    await createRoles();

    target = await hire('Rosalind');
    await hire('Victor');
    auth = await signIn(app, await hire('Wendy'));
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('finds an employee by a part of the name, ignoring the case', async () => {
    expect(await search('ROSAL')).toEqual([target.id]);
  });

  test('finds an employee by the employee number', async () => {
    expect(await search(target.employeeNumber)).toEqual([target.id]);
  });

  test('finds nobody for an unknown name', async () => {
    expect(await search('Nobody')).toEqual([]);
  });
});
