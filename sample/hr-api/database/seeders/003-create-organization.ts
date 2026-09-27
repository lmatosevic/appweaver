import { hashPassword } from '@appweaver/core';
import { db } from '@db/client';
import { allowanceFor } from '@/features/leave/leave-accrual';
import { countWorkingDays } from '@/features/leave/working-days';

/** Every demo employee signs in with this password. */
const DEMO_PASSWORD = 'Passw0rd!';

const year = new Date().getUTCFullYear();

/** A date relative to today, at midnight UTC. */
const daysFromNow = (days: number) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

/** The next Monday at least the given number of days away. */
const mondayIn = (days: number) => {
  const date = daysFromNow(days);
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7));
  return date;
};

/** Four days after the given date, a Friday for a Monday. */
const weekEnd = (monday: Date) => {
  const date = new Date(monday);
  date.setUTCDate(date.getUTCDate() + 4);
  return date;
};

/**
 * Four departments with their positions, a reporting line of eight employees
 * with salaries and leave balances, some leave requests in every state, and
 * two performance reviews.
 */
export async function createOrganization(): Promise<string> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const department = async (name: string, code: string, costCenter: string) =>
    db.department.create({ data: { name, code, costCenter } });

  const engineering = await department('Engineering', 'ENG', 'CC-1100');
  const people = await department('People', 'PPL', 'CC-1200');
  const sales = await department('Sales', 'SAL', 'CC-1300');
  const finance = await department('Finance', 'FIN', 'CC-1400');

  const position = async (
    departmentId: number,
    title: string,
    level: 'Junior' | 'Mid' | 'Senior' | 'Lead',
    salaryMin: number,
    salaryMax: number,
    openings = 0
  ) =>
    db.position.create({
      data: { departmentId, title, level, salaryMin, salaryMax, openings }
    });

  const positions = {
    engineeringManager: await position(
      engineering.id,
      'Engineering Manager',
      'Lead',
      70000,
      90000
    ),
    seniorEngineer: await position(
      engineering.id,
      'Backend Engineer',
      'Senior',
      55000,
      75000
    ),
    engineer: await position(
      engineering.id,
      'Backend Engineer',
      'Mid',
      40000,
      55000,
      1
    ),
    engineeringIntern: await position(
      engineering.id,
      'Engineering Intern',
      'Junior',
      12000,
      18000
    ),
    hrDirector: await position(people.id, 'HR Director', 'Lead', 60000, 80000),
    salesManager: await position(
      sales.id,
      'Sales Manager',
      'Lead',
      55000,
      75000
    ),
    accountExecutive: await position(
      sales.id,
      'Account Executive',
      'Mid',
      35000,
      50000,
      2
    ),
    payrollSpecialist: await position(
      finance.id,
      'Payroll Specialist',
      'Mid',
      38000,
      50000
    )
  };

  let number = 1;
  const employee = async (data: {
    firstName: string;
    lastName: string;
    departmentId: number;
    position: { id: number; salaryMin: number; salaryMax: number };
    roles: string[];
    hireDate: string;
    employmentType?: 'FullTime' | 'PartTime' | 'Intern';
    managerId?: string;
  }) => {
    number++;
    const created = await db.employee.create({
      data: {
        employeeNumber: `EMP-${String(number).padStart(4, '0')}`,
        firstName: data.firstName,
        lastName: data.lastName,
        email: `${data.firstName}.${data.lastName}@hr.example.com`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, ''),
        hireDate: new Date(data.hireDate),
        employmentType: data.employmentType ?? 'FullTime',
        departmentId: data.departmentId,
        positionId: data.position.id,
        managerId: data.managerId,
        passwordHash,
        verifiedEmail: true,
        roles: {
          connect: [...data.roles, 'Employee'].map((name) => ({ name }))
        }
      }
    });

    // Paid at the middle of the band of the position
    await db.compensation.create({
      data: {
        employeeId: created.id,
        baseSalary: (data.position.salaryMin + data.position.salaryMax) / 2,
        reason: 'Hire',
        effectiveFrom: new Date(data.hireDate)
      }
    });

    await db.leaveBalance.create({
      data: {
        employeeId: created.id,
        year,
        allowanceDays: allowanceFor(created.employmentType),
        carriedOverDays: 2
      }
    });

    return created;
  };

  const maja = await employee({
    firstName: 'Maja',
    lastName: 'Kovač',
    departmentId: people.id,
    position: positions.hrDirector,
    roles: ['HR'],
    hireDate: '2019-04-01'
  });
  const ivan = await employee({
    firstName: 'Ivan',
    lastName: 'Horvat',
    departmentId: engineering.id,
    position: positions.engineeringManager,
    roles: ['Manager'],
    hireDate: '2020-09-14'
  });
  const petra = await employee({
    firstName: 'Petra',
    lastName: 'Babić',
    departmentId: engineering.id,
    position: positions.seniorEngineer,
    roles: [],
    hireDate: '2021-02-01',
    managerId: ivan.id
  });
  const luka = await employee({
    firstName: 'Luka',
    lastName: 'Marić',
    departmentId: engineering.id,
    position: positions.engineer,
    roles: [],
    hireDate: '2023-06-12',
    managerId: ivan.id
  });
  const tomislav = await employee({
    firstName: 'Tomislav',
    lastName: 'Perić',
    departmentId: engineering.id,
    position: positions.engineeringIntern,
    roles: [],
    hireDate: `${year}-03-01`,
    employmentType: 'Intern',
    managerId: ivan.id
  });
  const ana = await employee({
    firstName: 'Ana',
    lastName: 'Jurić',
    departmentId: sales.id,
    position: positions.salesManager,
    roles: ['Manager'],
    hireDate: '2021-11-02'
  });
  const marko = await employee({
    firstName: 'Marko',
    lastName: 'Novak',
    departmentId: sales.id,
    position: positions.accountExecutive,
    roles: [],
    hireDate: '2024-01-08',
    employmentType: 'PartTime',
    managerId: ana.id
  });
  await employee({
    firstName: 'Sara',
    lastName: 'Knežević',
    departmentId: finance.id,
    position: positions.payrollSpecialist,
    roles: ['Payroll'],
    hireDate: '2022-05-16',
    managerId: maja.id
  });

  await db.department.update({
    where: { id: engineering.id },
    data: { headId: ivan.id }
  });
  await db.department.update({
    where: { id: people.id },
    data: { headId: maja.id }
  });
  await db.department.update({
    where: { id: sales.id },
    data: { headId: ana.id }
  });

  const leave = async (
    employeeId: string,
    type: 'Annual' | 'Sick',
    startDate: Date,
    endDate: Date,
    decision?: { status: 'Approved' | 'Rejected'; by: string; note?: string },
    createdAt?: Date
  ) => {
    const days = countWorkingDays(startDate, endDate);
    await db.leaveRequest.create({
      data: {
        employeeId,
        type,
        startDate,
        endDate,
        days,
        status: decision?.status ?? 'Pending',
        decidedById: decision?.by,
        decidedAt: decision ? new Date() : undefined,
        decisionNote: decision?.note,
        createdAt
      }
    });

    if (decision?.status === 'Approved' && type === 'Annual') {
      await db.leaveBalance.updateMany({
        where: { employeeId, year: startDate.getUTCFullYear() },
        data: { usedDays: { increment: days } }
      });
    }
  };

  // Waiting for Ivan, one of them long enough for the morning reminder
  await leave(petra.id, 'Annual', mondayIn(30), weekEnd(mondayIn(30)));
  await leave(
    tomislav.id,
    'Annual',
    mondayIn(14),
    mondayIn(14),
    undefined,
    daysFromNow(-3)
  );
  // Already decided
  await leave(luka.id, 'Annual', mondayIn(-60), weekEnd(mondayIn(-60)), {
    status: 'Approved',
    by: ivan.id
  });
  await leave(marko.id, 'Sick', daysFromNow(-20), daysFromNow(-18), {
    status: 'Approved',
    by: ana.id
  });
  await leave(
    luka.id,
    'Annual',
    mondayIn(7),
    weekEnd(mondayIn(7)),
    { status: 'Rejected', by: ivan.id, note: 'Release week, pick another one' },
    daysFromNow(-5)
  );

  await db.performanceReview.create({
    data: {
      employeeId: petra.id,
      reviewerId: ivan.id,
      period: `${year}-H1`,
      rating: 5,
      strengths: 'Led the billing migration without a single incident.',
      improvements: 'Share knowledge with the newer members of the team.',
      goals: [
        { title: 'Mentor an intern', done: false },
        { title: 'Present at the engineering all-hands', done: true }
      ],
      status: 'Shared'
    }
  });
  await db.performanceReview.create({
    data: {
      employeeId: luka.id,
      reviewerId: ivan.id,
      period: `${year}-H1`,
      rating: 3,
      strengths: 'Reliable delivery of the planned work.',
      status: 'Draft'
    }
  });

  return `Seeded 8 employees, their password is ${DEMO_PASSWORD}`;
}
