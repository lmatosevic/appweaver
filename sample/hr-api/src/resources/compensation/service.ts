import { ErrorCode, RequestError } from '@appweaver/common';
import { createService, ResourceError } from '@appweaver/core';
import db from '@db/client';

export default createService({
  modelName: 'Compensation',
  beforeCreate: async (data) => {
    const employeeId =
      typeof data.employee === 'object' ? data.employee.id : data.employee;
    await assertWithinBand(employeeId, data.baseSalary, data.reason);
  }
});

/**
 * A salary must fall into the band of the position of the employee, except
 * for a market adjustment, which is how a band is outgrown on purpose.
 */
async function assertWithinBand(
  employeeId: string,
  baseSalary: number,
  reason?: string
): Promise<void> {
  const employee = await db.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    include: { position: true }
  });
  if (!employee) {
    throw new ResourceError(ErrorCode.ResourceNotFound, 'Employee not found', {
      model: 'Employee',
      id: employeeId
    });
  }

  const band = employee.position;
  if (!band || reason === 'Market') {
    return;
  }

  if (baseSalary < band.salaryMin || baseSalary > band.salaryMax) {
    throw new RequestError(
      ErrorCode.ValidationFailed,
      `Salary ${baseSalary} is outside the ${band.title} band (${band.salaryMin} - ${band.salaryMax})`,
      {
        errors: [
          {
            field: 'baseSalary',
            rule: 'salaryBand',
            message: `must be between ${band.salaryMin} and ${band.salaryMax}`
          }
        ]
      }
    );
  }
}
