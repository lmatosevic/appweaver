import db from '@db/client';
import { Employee } from '@/types';
import {
  ANNUAL_ALLOWANCE_DAYS,
  MAX_CARRY_OVER_DAYS,
  REDUCED_ALLOWANCE_DAYS
} from './constants';
import { proratedAllowance } from './working-days';

/** Contractors are not entitled to paid leave. */
export function allowanceFor(
  employmentType: Employee['employmentType']
): number {
  switch (employmentType) {
    case 'FullTime':
      return ANNUAL_ALLOWANCE_DAYS;
    case 'PartTime':
    case 'Intern':
      return REDUCED_ALLOWANCE_DAYS;
    default:
      return 0;
  }
}

/**
 * Opens the balance of the year for every employee still missing one, moving
 * the unused days of the previous year over up to the carry-over limit.
 */
export async function openLeaveYear(year: number): Promise<number> {
  const employees = await db.employee.findMany({
    where: {
      deletedAt: null,
      status: { not: 'Terminated' },
      employmentType: { not: 'Contractor' },
      leaveBalances: { none: { year, deletedAt: null } }
    },
    include: {
      leaveBalances: { where: { year: year - 1, deletedAt: null } }
    }
  });

  for (const employee of employees) {
    const previous = employee.leaveBalances[0];
    const unused = previous
      ? previous.allowanceDays + previous.carriedOverDays - previous.usedDays
      : 0;

    await db.leaveBalance.create({
      data: {
        year,
        employeeId: employee.id,
        allowanceDays: allowanceFor(employee.employmentType),
        carriedOverDays: Math.min(Math.max(unused, 0), MAX_CARRY_OVER_DAYS)
      }
    });
  }

  return employees.length;
}

/**
 * Opens the balance of a new hire for the year they start in, prorated to the
 * part of the year left.
 */
export async function openNewHireBalance(employee: {
  id: string;
  hireDate: Date;
  employmentType: Employee['employmentType'];
}): Promise<void> {
  const allowance = allowanceFor(employee.employmentType);
  if (allowance === 0) {
    return;
  }

  const hireDate = new Date(employee.hireDate);
  await db.leaveBalance.upsert({
    where: {
      employeeId_year: {
        employeeId: employee.id,
        year: hireDate.getUTCFullYear()
      }
    },
    update: {},
    create: {
      employeeId: employee.id,
      year: hireDate.getUTCFullYear(),
      allowanceDays: proratedAllowance(allowance, hireDate)
    }
  });
}
