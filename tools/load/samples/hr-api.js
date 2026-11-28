// The employees of the HR API on SQL Server, UUIDv7 IDs, read by the admin with the permissions of HR.
const { resourceScenarios, collectIds } = require('../lib/scenarios');

module.exports = {
  database: 'sqlserver',
  services: ['sqlserver'],
  port: 5003,
  auth: 'login',
  env: { RATE_LIMIT_ENABLED: 'false' },

  seed: {
    model: 'employee',
    prepare: async ({ ids }) => ({ departments: await ids('department'), positions: await ids('position') }),
    row: ({ index, runId, refs, random }) => {
      const hireDate = random.date(3_650);
      return {
        employeeNumber: `L${runId}${index}`,
        firstName: random.word(),
        lastName: random.word(),
        email: `load-${runId}-${index}@hr.example.com`,
        employmentType: random.pick(['FullTime', 'FullTime', 'FullTime', 'PartTime', 'Contractor', 'Intern']),
        status: random.pick(['Active', 'Active', 'Active', 'Active', 'OnLeave', 'Terminated']),
        hireDate,
        departmentId: random.pick(refs.departments),
        positionId: random.pick(refs.positions),
        createdAt: hireDate,
        updatedAt: hireDate
      };
    }
  },

  prepare: async (api) => ({
    employees: await collectIds(api, '/api/employees'),
    departments: (await api.post('/api/departments/query', { size: 100, totalCount: false })).items.map((d) => d.id)
  }),

  scenarios: resourceScenarios({
    path: '/api/employees',
    bust: 'email',
    auth: true,
    findId: (c) => c.random.pick(c.employees),
    filterSort: (c) => ({ filter: { status: 'Active', department: c.random.pick(c.departments) }, sort: ['lastName'] }),
    filterSortDescription: '`query`, `status` + `department`, `lastName`',
    textSearch: true,
    aggregate: { select: { hireDate: { count: true } }, dateField: 'hireDate' }
  })
};
