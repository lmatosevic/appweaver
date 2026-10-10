import { Application, createApp, injectService } from '@appweaver/core';
import { resetTestData } from './support/reset';
import { createRoles, hire, signIn } from './support/fixtures';

/**
 * The permissions of the routes and the row level policies, over HTTP: who
 * changes which profile, sees which salary, reads which document file, and
 * sees which review.
 */
describe('Access policies', () => {
  let app: Application;
  let manager: any;
  let employee: any;
  let other: any;
  let hr: any;
  let payroll: any;
  let as: Record<string, Record<string, string>>;

  // A one page PDF, enough for the media type check of the upload
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'
  );

  const request = async (
    auth: Record<string, string>,
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: object
  ) => {
    const response = await app.server.inject({
      method,
      url: `/api${url}`,
      headers: auth,
      payload
    });
    return { status: response.statusCode, body: response.json() };
  };

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    await createRoles();

    manager = await hire('Mark', { roles: ['Manager'] });
    employee = await hire('Elena', { manager: manager.id });
    other = await hire('Oscar');
    hr = await hire('Helen', { roles: ['HR'] });
    payroll = await hire('Paula', { roles: ['Payroll'] });

    const compensations = injectService('Compensation');
    for (const person of [employee, other]) {
      await compensations.create({
        employee: person.id,
        baseSalary: 50000,
        currency: 'EUR',
        reason: 'Hire',
        effectiveFrom: new Date('2024-01-15T00:00:00.000Z')
      });
    }

    as = {
      manager: await signIn(app, manager),
      employee: await signIn(app, employee),
      other: await signIn(app, other),
      hr: await signIn(app, hr),
      payroll: await signIn(app, payroll)
    };
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  describe('employee profiles', () => {
    test('lets an employee change their own contact details', async () => {
      const { status, body } = await request(
        as.employee,
        'PUT',
        `/employees/${employee.id}`,
        { phone: '+385911234567' }
      );

      expect(status).toBe(200);
      expect(body.phone).toBe('+385911234567');
    });

    test('keeps the organization fields for HR', async () => {
      const { status, body } = await request(
        as.employee,
        'PUT',
        `/employees/${employee.id}`,
        { manager: null, employmentType: 'Contractor' }
      );

      expect(status).toBe(403);
      expect(body.code).toBe('RESOURCE_FORBIDDEN');
      expect(body.detail).toBe('Only HR can change: manager, employmentType');
    });

    test('keeps other profiles for HR', async () => {
      const { status } = await request(
        as.employee,
        'PUT',
        `/employees/${other.id}`,
        { phone: '+385911234567' }
      );

      expect(status).toBe(403);
    });

    test('disables the account of a terminated employee', async () => {
      const leaver = await hire('Leo');

      const { body } = await request(as.hr, 'PUT', `/employees/${leaver.id}`, {
        status: 'Terminated'
      });

      expect(body).toMatchObject({ status: 'Terminated', enabled: false });
      expect(body.terminatedAt).toBeDefined();

      const login = await app.server.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: leaver.email, password: 'Passw0rd!' }
      });
      expect(login.statusCode).toBe(401);
      expect(login.json().code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(login.json().detail).toMatch(/disabled/);
    });
  });

  describe('salaries', () => {
    test('shows an employee their own pay history only', async () => {
      const { body } = await request(
        as.employee,
        'POST',
        '/compensations/query',
        {}
      );

      expect(body.items.map((item: any) => item.employee.id)).toEqual([
        employee.id
      ]);
    });

    test('shows payroll every salary', async () => {
      const { body } = await request(
        as.payroll,
        'POST',
        '/compensations/query',
        {}
      );

      expect(body.totalCount).toBe(2);
    });

    test('aggregates the salaries for payroll only', async () => {
      const select = { select: { baseSalary: { sum: true, avg: true } } };

      const denied = await request(
        as.employee,
        'POST',
        '/compensations/aggregate',
        select
      );
      const allowed = await request(
        as.payroll,
        'POST',
        '/compensations/aggregate',
        select
      );

      expect(denied.status).toBe(403);
      expect(allowed.body.total).toEqual({
        baseSalary: { sum: 100000, avg: 50000 }
      });
    });
  });

  describe('documents', () => {
    let contractId: number;

    beforeAll(async () => {
      const contract = await request(as.hr, 'POST', '/documents', {
        title: 'Employment contract',
        category: 'Contract',
        employee: employee.id
      });
      contractId = contract.body.id;

      const upload = await app.server.inject({
        method: 'POST',
        url: `/api/documents/${contractId}/files`,
        headers: {
          ...as.hr,
          'content-type': 'multipart/form-data; boundary=x'
        },
        payload: multipart('file', 'contract.pdf', 'application/pdf', pdf)
      });
      if (upload.statusCode !== 200) {
        throw new Error(`Contract upload failed: ${upload.body}`);
      }
    });

    test('lets only HR file documents', async () => {
      const { status } = await request(as.employee, 'POST', '/documents', {
        title: 'Forged contract',
        employee: employee.id
      });

      expect(status).toBe(403);
    });

    test('hides the documents of other employees', async () => {
      const own = await request(as.employee, 'GET', `/documents/${contractId}`);
      const others = await request(as.other, 'GET', `/documents/${contractId}`);

      expect(own.status).toBe(200);
      expect(others.status).toBe(404);
    });

    // The document itself is hidden from the manager, so is its file
    test('serves the file to its owner and HR only', async () => {
      const document = await request(as.hr, 'GET', `/documents/${contractId}`);
      const url = new URL(document.body.file.url).pathname;

      const download = async (auth: Record<string, string>) =>
        (await app.server.inject({ method: 'GET', url, headers: auth }))
          .statusCode;

      expect(await download(as.employee)).toBe(200);
      expect(await download(as.hr)).toBe(200);
      expect(await download(as.manager)).toBe(404);
    });
  });

  describe('performance reviews', () => {
    let reviewId: number;

    beforeAll(async () => {
      const review = await request(as.manager, 'POST', '/performance-reviews', {
        employee: employee.id,
        period: '2026-H1',
        rating: 4,
        status: 'Draft'
      });
      reviewId = review.body.id;
    });

    test('attributes the review to the signed-in reviewer', async () => {
      const { body } = await request(
        as.manager,
        'GET',
        `/performance-reviews/${reviewId}`
      );

      expect(body.reviewer.id).toBe(manager.id);
    });

    test('lets managers review their direct reports only', async () => {
      const { status } = await request(
        as.manager,
        'POST',
        '/performance-reviews',
        { employee: other.id, period: '2026-H1', rating: 3, status: 'Draft' }
      );

      expect(status).toBe(403);
    });

    test('shows the review to the employee once it is shared', async () => {
      const hidden = await request(
        as.employee,
        'GET',
        `/performance-reviews/${reviewId}`
      );
      await request(as.manager, 'PUT', `/performance-reviews/${reviewId}`, {
        status: 'Shared'
      });
      const shared = await request(
        as.employee,
        'GET',
        `/performance-reviews/${reviewId}`
      );

      expect(hidden.status).toBe(404);
      expect(shared.status).toBe(200);
    });
  });
});

/** A multipart body holding a single file. */
function multipart(
  field: string,
  fileName: string,
  mimeType: string,
  data: Buffer
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--x\r\nContent-Disposition: form-data; name="${field}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    data,
    Buffer.from('\r\n--x--\r\n')
  ]);
}
