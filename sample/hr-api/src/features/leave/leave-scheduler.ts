import { inject } from '@appweaver/core';
import { logger, Scheduler } from '@appweaver/common';
import db from '@db/client';
import { REMINDER_AFTER_DAYS } from './constants';
import { openLeaveYear } from './leave-accrual';
import { remindManagers } from './leave-notifications';

const scheduler = inject(Scheduler);

// Midnight of the new year, the balances of the year are opened
scheduler.addJob({
  cronTime: '0 0 1 1 *',
  timeZone: 'UTC',
  onTick: async () => {
    const opened = await openLeaveYear(new Date().getUTCFullYear());
    logger.info(`Leave balances opened: ${opened}`);
  }
});

// Weekday mornings, managers hear about the requests they left waiting
scheduler.addJob({
  cronTime: '0 9 * * 1-5',
  onTick: async () => {
    await sendPendingReminders();
  }
});

/** Emails every manager the requests of their reports left undecided. */
export async function sendPendingReminders(): Promise<number> {
  const olderThan = new Date(Date.now() - REMINDER_AFTER_DAYS * 86_400_000);

  const pending = await db.leaveRequest.findMany({
    where: {
      status: 'Pending',
      deletedAt: null,
      createdAt: { lte: olderThan },
      employee: { managerId: { not: null } }
    },
    include: { employee: { include: { manager: true } } },
    orderBy: { startDate: 'asc' }
  });

  const byManager = new Map<
    string,
    { manager: { email: string; firstName: string }; pending: string[] }
  >();
  for (const request of pending) {
    const manager = request.employee?.manager;
    if (!manager) {
      continue;
    }

    const entry = byManager.get(manager.id) ?? { manager, pending: [] };
    entry.pending.push(
      `${request.employee!.firstName} ${request.employee!.lastName}: ` +
        `${request.type} leave from ${request.startDate.toISOString().slice(0, 10)} (${request.days} days)`
    );
    byManager.set(manager.id, entry);
  }

  await remindManagers([...byManager.values()]);

  return byManager.size;
}
