import { CacheService, inject } from '@appweaver/core';
import { logger, Scheduler } from '@appweaver/common';
import db from '@db/client';
import { sendEscalation } from '@/features/notifications/ticket-emails';
import { escalatedPriority } from './sla';

// Every five minutes, overdue tickets move up a priority and alert their team
inject(Scheduler).addJob({
  cronTime: '*/5 * * * *',
  onTick: async () => {
    const escalated = await escalateOverdueTickets();
    if (escalated > 0) {
      logger.info(`Tickets escalated: ${escalated}`);
    }
  }
});

/** Escalates every open ticket past its resolution target, once. */
export async function escalateOverdueTickets(
  now: Date = new Date()
): Promise<number> {
  const overdue = await db.ticket.findMany({
    where: {
      escalated: false,
      status: { notIn: ['Resolved', 'Closed'] },
      resolutionDueAt: { lt: now }
    },
    include: { customer: true, team: true }
  });

  for (const ticket of overdue) {
    const priority = escalatedPriority(ticket.priority);
    await db.ticket.update({
      where: { id: ticket.id },
      data: { escalated: true, priority }
    });

    if (ticket.team) {
      await sendEscalation(ticket.team.email, { ...ticket, priority });
    }
  }

  if (overdue.length > 0) {
    await inject(CacheService).invalidateCache('Ticket', 'update');
  }

  return overdue.length;
}
