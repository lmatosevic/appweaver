import { createAuthService, injectService } from '@appweaver/core';
import { EmployeeCreate, EmployeeUpdate } from '@/types';

export default createAuthService({
  modelName: 'Employee',
  // Accounts are opened by HR, so a sign-in never registers a new employee
  checkOAuth2User: (_, __, authUser) => {
    if (!authUser) {
      return 'Only existing employees can sign in';
    }
  },
  beforeCreate: async (data: EmployeeCreate & { employeeNumber?: string }) => {
    data.employeeNumber = await nextEmployeeNumber();
  },
  // A terminated employee can no longer sign in
  beforeUpdate: (_, data: EmployeeUpdate & { terminatedAt?: Date | null }) => {
    if (data.status === 'Terminated') {
      data.terminatedAt = new Date();
      data.enabled = false;
    } else if (data.status) {
      data.terminatedAt = null;
    }
  },
  textSearch: {
    OR: {
      firstName: {
        contains: '{input}'
      },
      lastName: {
        contains: '{input}'
      },
      email: {
        contains: '{input}'
      },
      employeeNumber: {
        contains: '{input}'
      }
    }
  }
});

/** Numbers follow the highest one given out, deleted employees included. */
async function nextEmployeeNumber(): Promise<string> {
  const last = await injectService('Employee').client.findFirst({
    orderBy: { employeeNumber: 'desc' },
    select: { employeeNumber: true }
  });

  const next = last ? parseInt(last.employeeNumber.slice(4), 10) + 1 : 1;

  return `EMP-${String(next).padStart(4, '0')}`;
}
