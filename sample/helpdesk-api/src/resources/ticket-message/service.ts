import { CacheService, createService, inject } from '@appweaver/core';
import db from '@db/client';
import { TicketMessage } from '@/types';
import { sendAgentReply } from '@/features/notifications/ticket-emails';

type MessageRecord = TicketMessage & {
  ticketId: string;
  authorId: number | null;
};

export default createService({
  modelName: 'TicketMessage',
  // A reply moves the ticket along: an agent's answer waits on the customer,
  // and the customer's answer puts it back in the queue of the agent
  afterCreate: async (message: MessageRecord) => {
    if (message.internal) {
      return;
    }

    const ticket = await db.ticket.findUniqueOrThrow({
      where: { id: message.ticketId },
      include: { customer: true }
    });

    if (message.fromCustomer) {
      await db.ticket.update({
        where: { id: ticket.id },
        data: { status: 'Open' }
      });
    } else {
      await db.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'Pending',
          firstRespondedAt: ticket.firstRespondedAt ?? new Date()
        }
      });
      await sendAgentReply(ticket, {
        body: message.body,
        agentName: message.author?.name ?? 'Support'
      });
    }

    await inject(CacheService).invalidateCache('Ticket', 'update');
  }
});
