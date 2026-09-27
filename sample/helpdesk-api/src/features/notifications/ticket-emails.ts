import { EmailService, inject } from '@appweaver/core';
import { Email, logger } from '@appweaver/common';

type TicketMail = {
  reference: string;
  subject: string;
  customer: { email: string; name: string };
};

/** Queues the email, never failing the caller. */
async function send(email: Email): Promise<void> {
  try {
    await inject(EmailService).sendEmail(email);
  } catch (e) {
    logger.warn(e, `Email "${email.subject}" was not sent`);
  }
}

/** Confirms to the customer the ticket was received. */
export function sendTicketReceived(ticket: TicketMail): Promise<void> {
  return send({
    to: ticket.customer.email,
    subject: `[${ticket.reference}] ${ticket.subject}`,
    text: [
      `Hi ${ticket.customer.name},`,
      '',
      `we received your request and will get back to you soon. Quote ${ticket.reference} in any follow-up.`
    ].join('\n')
  });
}

/** Sends the reply of an agent to the customer. */
export function sendAgentReply(
  ticket: TicketMail,
  reply: { body: string; agentName: string }
): Promise<void> {
  return send({
    to: ticket.customer.email,
    subject: `Re: [${ticket.reference}] ${ticket.subject}`,
    text: `${reply.body}\n\n-- \n${reply.agentName}, Support`
  });
}

/** Warns the team its ticket is overdue. */
export function sendEscalation(
  teamEmail: string,
  ticket: TicketMail & { priority: string }
): Promise<void> {
  return send({
    to: teamEmail,
    subject: `Escalated: [${ticket.reference}] ${ticket.subject}`,
    text: `The ticket of ${ticket.customer.name} missed its resolution target and is now ${ticket.priority}.`
  });
}
