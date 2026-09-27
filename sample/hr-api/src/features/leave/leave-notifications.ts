import { EmailService, inject } from '@appweaver/core';
import { logger } from '@appweaver/common';

type Recipient = { email: string; firstName: string };

type DecidedRequest = {
  status: string;
  type: string;
  startDate: Date;
  endDate: Date;
  days: number;
  decisionNote?: string | null;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

/** Tells the employee how their request was decided. Never fails the caller. */
export async function notifyLeaveDecision(
  employee: Recipient,
  request: DecidedRequest
): Promise<void> {
  const period = `${formatDate(request.startDate)} - ${formatDate(request.endDate)}`;
  const lines = [
    `Hi ${employee.firstName},`,
    '',
    `your ${request.type.toLowerCase()} leave request for ${period} (${request.days} working days) was ${request.status.toLowerCase()}.`
  ];
  if (request.decisionNote) {
    lines.push('', `Note: ${request.decisionNote}`);
  }

  try {
    await inject(EmailService).sendEmail({
      to: employee.email,
      subject: `Leave request ${request.status.toLowerCase()}`,
      text: lines.join('\n')
    });
  } catch (e) {
    logger.warn(e, 'Leave decision email was not sent');
  }
}

/** Lists the requests a manager still has to decide on. */
export async function remindManagers(
  reminders: { manager: Recipient; pending: string[] }[]
): Promise<void> {
  if (reminders.length === 0) {
    return;
  }

  await inject(EmailService).sendEmailBulk(
    reminders.map(({ manager, pending }) => ({
      to: manager.email,
      subject: `${pending.length} leave request(s) waiting for you`,
      text: [
        `Hi ${manager.firstName},`,
        '',
        'these leave requests of your team are waiting for a decision:',
        ...pending.map((line) => `- ${line}`)
      ].join('\n')
    }))
  );
}
