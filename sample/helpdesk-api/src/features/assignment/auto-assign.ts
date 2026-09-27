import { CacheService, inject } from '@appweaver/core';
import { Events, logger } from '@appweaver/common';
import db from '@db/client';
import { Ticket } from '@/types';
import { Role } from '@/features/access/roles';

// Every new ticket without an assignee goes to an agent, however it came in
inject(Events).onResourceEvent<Ticket & { teamId?: number | null }>(
  'Ticket',
  'create',
  async ({ current }) => {
    if (current.assignee) {
      return;
    }

    try {
      const agentId = await leastLoadedAgent(current.teamId ?? null);
      if (agentId) {
        await db.ticket.update({
          where: { id: current.id },
          data: { assigneeId: agentId }
        });
        await inject(CacheService).invalidateCache('Ticket', 'update');
      }
    } catch (e) {
      logger.error(e, `Ticket ${current.id} was not assigned`);
    }
  }
);

/**
 * The available agent of the team holding the fewest open tickets, or of any
 * team when the ticket has none. Ties go to the agent who joined first.
 */
export async function leastLoadedAgent(
  teamId: number | null
): Promise<number | null> {
  const agents = await db.user.findMany({
    where: {
      enabled: true,
      available: true,
      roles: { some: { name: Role.Agent } },
      ...(teamId ? { teamId } : {})
    },
    select: {
      id: true,
      _count: {
        select: {
          assignedTickets: {
            where: { status: { in: ['New', 'Open', 'Pending'] } }
          }
        }
      }
    },
    orderBy: { id: 'asc' }
  });

  if (agents.length === 0) {
    return teamId ? leastLoadedAgent(null) : null;
  }

  return agents.reduce((least, agent) =>
    agent._count.assignedTickets < least._count.assignedTickets ? agent : least
  ).id;
}
