# HR API

> Appweaver sample - Human Resources API with employees, leave requests and documents

An internal HR system: an employee directory with a reporting line, leave requests approved by managers and booked
against yearly balances, salaries only payroll can see, personal documents, and performance reviews.

## What it showcases

| Feature                                                                                | Where                                                                                     |
|----------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| Auth model named `Employee` (not `User`), with UUIDv7 string ids                       | [`resources/employee/model.ts`](src/resources/employee/model.ts)                          |
| Soft delete cascading into every record an employee owns                               | `softDelete` on all employee-owned models                                                 |
| Self-relation for the reporting line (`manager` / `reports` with a count)              | [`resources/employee/model.ts`](src/resources/employee/model.ts)                          |
| **Permission** based access instead of roles, roles only group permissions             | [`features/access/permissions.ts`](src/features/access/permissions.ts)                    |
| Row level read restrictions: own records, the team's, or everyone's                    | [`features/access/team-restriction.ts`](src/features/access/team-restriction.ts)          |
| Write restrictions guarding the fields only HR may change                              | [`resources/employee/policy.ts`](src/resources/employee/policy.ts)                        |
| Protected files with custom `canAccess` checks (contracts, doctor's notes)             | [`resources/employee-document/policy.ts`](src/resources/employee-document/policy.ts)      |
| Custom routes with a transactional workflow (approve, reject, cancel)                  | [`features/leave/`](src/features/leave/leave-routes.ts)                                   |
| Service hooks: generated employee numbers, business day counting, overlap checks       | [`resources/leave-request/service.ts`](src/resources/leave-request/service.ts)            |
| Resource events: a hire opens a prorated leave balance and gets a welcome email        | [`features/onboarding/`](src/features/onboarding/onboarding-listener.ts)                  |
| Scheduled jobs: yearly leave accrual with carry-over, weekday reminders for managers   | [`features/leave/leave-scheduler.ts`](src/features/leave/leave-scheduler.ts)              |
| Queued emails through `EmailService` (JSON mailer in development)                      | [`features/leave/leave-notifications.ts`](src/features/leave/leave-notifications.ts)      |
| A custom model and cached report route built on Prisma `groupBy`                       | [`features/reports/headcount-route.ts`](src/features/reports/headcount-route.ts)          |
| Virtual fields (`fullName`, `yearsOfService`, `remainingDays`)                         | employee and leave balance models                                                         |
| Composite unique constraints (one balance per employee and year)                       | [`resources/leave-balance/model.ts`](src/resources/leave-balance/model.ts)                |
| Aggregates and CSV exports behind permissions                                          | compensation and employee routes                                                          |
| OAuth2 sign-in limited to existing employees (`checkOAuth2User`)                       | [`resources/employee/service.ts`](src/resources/employee/service.ts)                      |
| Redis-free setup: in-memory cache, rate limit, and queue                               | [`appweaver.json`](appweaver.json)                                                        |

## Roles and permissions

| Role       | Permissions                                                                                                  |
|------------|--------------------------------------------------------------------------------------------------------------|
| `Admin`    | all of them                                                                                                  |
| `HR`       | `employee:manage`, `leave:manage`, `leave:approve`, `document:manage`, `review:write`, `review:manage`       |
| `Payroll`  | `payroll:read`, `payroll:write`                                                                              |
| `Manager`  | `leave:approve`, `review:write`                                                                              |
| `Employee` | none, every employee holds it                                                                                |

## Getting started

Build the monorepo once from the repository root (`npm install && npm run build`), then in this directory:

```bash
cp .env.example .env   # NODE_ENV=dev, for the development configuration
npm run migrate        # create the SQLite database in ./data
npm run seed      # roles, the admin, and a demo organization
npm run dev       # http://localhost:5003, Swagger UI at http://localhost:5003/swagger
```

The seeder prints the generated admin password (`admin@hr.example.com`). The demo employees all sign in with
`Passw0rd!`:

| Email                           | Role     | Reports to     |
|---------------------------------|----------|----------------|
| `megan.clark@hr.example.com`    | HR       | -              |
| `michael.turner@hr.example.com` | Manager  | -              |
| `emily.parker@hr.example.com`   | Employee | Michael Turner |
| `jacob.miller@hr.example.com`   | Employee | Michael Turner |
| `tyler.brooks@hr.example.com`   | Intern   | Michael Turner |
| `sarah.mitchell@hr.example.com` | Manager  | -              |
| `ryan.cooper@hr.example.com`    | Employee | Sarah Mitchell |
| `jessica.hayes@hr.example.com`  | Payroll  | Megan Clark    |

## Try it out

```bash
login() {
  curl -s localhost:5003/auth/login -H 'content-type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"Passw0rd!\"}" | jq -r .accessToken
}
EMILY=$(login emily.parker@hr.example.com)
MICHAEL=$(login michael.turner@hr.example.com)

# Emily files a week of annual leave, the working days are counted for her
curl -s localhost:5003/api/leave-requests -H "authorization: Bearer $EMILY" -H 'content-type: application/json' \
  -d '{"type":"Annual","startDate":"2026-12-07T00:00:00.000Z","endDate":"2026-12-11T00:00:00.000Z"}' | jq '{id, days, status}'

# Michael, her manager, sees the requests of his team and approves it
curl -s localhost:5003/api/leave-requests/query -H "authorization: Bearer $MICHAEL" -H 'content-type: application/json' -d '{}' \
  | jq '.items[] | {id, employee: .employee.fullName, status}'
curl -s localhost:5003/api/leave-requests/<id>/approve -H "authorization: Bearer $MICHAEL" -H 'content-type: application/json' \
  -d '{"note":"Enjoy!"}' | jq .status

# The days are booked against Emily's balance
curl -s localhost:5003/api/leave-balances/query -H "authorization: Bearer $EMILY" -H 'content-type: application/json' -d '{}' \
  | jq '.items[] | {year, usedDays, remainingDays}'

# Emily only sees her own salary, and cannot move herself to another department
curl -s localhost:5003/api/compensations/query -H "authorization: Bearer $EMILY" -H 'content-type: application/json' -d '{}' | jq .totalCount
curl -s -X PUT localhost:5003/api/employees/<emily-id> -H "authorization: Bearer $EMILY" -H 'content-type: application/json' \
  -d '{"department":2}' | jq .message
```

## Tests

```bash
npm run test  # unit tests
npm run e2e   # end-to-end tests against a temporary SQLite database
```

## License

UNLICENSED
