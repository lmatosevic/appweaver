import { EmailService, inject } from '@appweaver/core';
import { Events, logger } from '@appweaver/common';
import { Employee } from '@/types';
import { openNewHireBalance } from '@/features/leave/leave-accrual';

// Runs for every new employee, however it was created (route, seeder, service)
inject(Events).onResourceEvent<Employee>(
  'Employee',
  'create',
  async ({ current }) => {
    try {
      await openNewHireBalance(current);

      await inject(EmailService).sendEmail({
        to: current.email,
        subject: 'Welcome aboard!',
        text: [
          `Hi ${current.firstName},`,
          '',
          `welcome to the team! Your employee number is ${current.employeeNumber}.`,
          'Sign in to see your leave balance and request time off.'
        ].join('\n')
      });
    } catch (e) {
      logger.error(e, `Onboarding of employee ${current.id} failed`);
    }
  }
);
