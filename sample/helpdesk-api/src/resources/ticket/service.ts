import { randomBytes } from 'node:crypto';
import { createService } from '@appweaver/core';
import db from '@db/client';
import { Ticket, TicketCreate, TicketUpdate } from '@/types';
import { sendTicketReceived } from '@/features/notifications/ticket-emails';
import { DEFAULT_SLA, slaDeadlines } from '@/features/sla/sla';

type TicketData = TicketCreate & {
  reference?: string;
  firstResponseDueAt?: Date;
  resolutionDueAt?: Date;
};

// The description is a virtual input, dropped before the ticket is stored, so
// it waits here, keyed by the reference, to become the opening message
const openingMessages = new Map<string, string>();

export default createService<Ticket, TicketCreate, TicketUpdate>({
  modelName: 'Ticket',
  beforeCreate: async (data: TicketData) => {
    data.reference = `HD-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;

    const priority = data.priority ?? 'Normal';
    const policy = await db.slaPolicy.findUnique({ where: { priority } });
    Object.assign(
      data,
      slaDeadlines(new Date(), policy ?? DEFAULT_SLA[priority])
    );

    if (data.description) {
      openingMessages.set(data.reference, data.description);
    }
  },
  afterCreate: async (ticket: Ticket) => {
    const description = openingMessages.get(ticket.reference);
    openingMessages.delete(ticket.reference);

    if (description) {
      await db.ticketMessage.create({
        data: { ticketId: ticket.id, body: description, fromCustomer: true }
      });
    }

    await sendTicketReceived(ticket);
  },
  beforeUpdate: (_, data: TicketUpdate & { resolvedAt?: Date | null }) => {
    if (data.status === 'Resolved' || data.status === 'Closed') {
      data.resolvedAt = new Date();
    } else if (data.status) {
      data.resolvedAt = null;
    }
  },
  textSearch: {
    OR: {
      subject: {
        contains: '{input}'
      },
      reference: {
        contains: '{input}'
      }
    }
  }
});
