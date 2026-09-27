import { db } from '@db/client';
import { DEFAULT_SLA, Priority, slaDeadlines } from '@/features/sla/sla';

/**
 * The SLA policies, the tags, a few canned responses, and tickets in every
 * state, one of them overdue for the escalation job.
 */
export async function createTickets(): Promise<string> {
  for (const [priority, targets] of Object.entries(DEFAULT_SLA)) {
    await db.slaPolicy.create({
      data: { priority: priority as Priority, ...targets }
    });
  }

  const tags = ['Invoices', 'Login', 'Outage', 'Feature request'];
  for (const name of tags) {
    await db.tag.create({
      data: { name, slug: name.toLowerCase().replace(/\s+/g, '-') }
    });
  }

  const billing = await db.team.findUniqueOrThrow({
    where: { slug: 'billing' }
  });
  const technical = await db.team.findUniqueOrThrow({
    where: { slug: 'technical' }
  });
  const agent = (email: string) =>
    db.user.findUniqueOrThrow({ where: { email } });
  const nika = await agent('nika@helpdesk.example.com');
  const filip = await agent('filip@helpdesk.example.com');

  await db.cannedResponse.createMany({
    data: [
      {
        title: 'Password reset steps',
        body: 'Open the sign-in page, choose "Forgot password", and follow the link we email you. The link is valid for 30 minutes.',
        teamId: technical.id
      },
      {
        title: 'Corrected invoice',
        body: 'We are sorry for the mistake, please find the corrected invoice attached.',
        teamId: billing.id
      },
      {
        title: 'Closing, no reply',
        body: 'We have not heard back from you, so we are closing this ticket. Reply to reopen it at any time.'
      }
    ]
  });

  const customer = (email: string, name: string, company?: string) =>
    db.customer.create({ data: { email, name, company } });
  const petra = await customer(
    'petra@acme.example.com',
    'Petra Novak',
    'Acme d.o.o.'
  );
  const ivo = await customer('ivo@example.com', 'Ivo Babić');
  const mara = await customer('mara@globex.example.com', 'Mara Kos', 'Globex');

  const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);

  const ticket = async (data: {
    reference: string;
    subject: string;
    priority: Priority;
    status: 'New' | 'Open' | 'Pending' | 'Resolved';
    customerId: number;
    teamId: number;
    assigneeId?: number;
    openedHoursAgo: number;
    tags: string[];
    messages: {
      body: string;
      fromCustomer?: boolean;
      authorId?: number;
      internal?: boolean;
    }[];
  }) => {
    const openedAt = ago(data.openedHoursAgo);
    const created = await db.ticket.create({
      data: {
        reference: data.reference,
        subject: data.subject,
        priority: data.priority,
        status: data.status,
        channel: 'Web',
        customerId: data.customerId,
        teamId: data.teamId,
        assigneeId: data.assigneeId,
        createdAt: openedAt,
        ...slaDeadlines(openedAt, DEFAULT_SLA[data.priority]),
        firstRespondedAt: data.messages.some((m) => m.authorId && !m.internal)
          ? ago(data.openedHoursAgo - 1)
          : undefined,
        resolvedAt: data.status === 'Resolved' ? ago(1) : undefined,
        tags: { connect: data.tags.map((slug) => ({ slug })) }
      }
    });

    for (const [index, message] of data.messages.entries()) {
      await db.ticketMessage.create({
        data: {
          ticketId: created.id,
          body: message.body,
          fromCustomer: message.fromCustomer ?? false,
          internal: message.internal ?? false,
          authorId: message.authorId,
          createdAt: ago(data.openedHoursAgo - index)
        }
      });
    }
  };

  await ticket({
    reference: 'HD-DEMO01',
    subject: 'Invoice shows the wrong VAT rate',
    priority: 'Normal',
    status: 'Pending',
    customerId: petra.id,
    teamId: billing.id,
    assigneeId: nika.id,
    openedHoursAgo: 20,
    tags: ['invoices'],
    messages: [
      {
        body: 'Our September invoice charges 25 % VAT, but we are VAT exempt.',
        fromCustomer: true
      },
      {
        body: 'Checked the account, the exemption certificate expired in August.',
        authorId: nika.id,
        internal: true
      },
      {
        body: 'Could you send us the renewed exemption certificate?',
        authorId: nika.id
      }
    ]
  });
  await ticket({
    reference: 'HD-DEMO02',
    subject: 'Cannot sign in after the update',
    priority: 'High',
    status: 'Open',
    customerId: ivo.id,
    teamId: technical.id,
    assigneeId: filip.id,
    openedHoursAgo: 30,
    tags: ['login'],
    messages: [
      {
        body: 'Since this morning the app says my password is wrong.',
        fromCustomer: true
      }
    ]
  });
  await ticket({
    reference: 'HD-DEMO03',
    subject: 'Dashboard does not load',
    priority: 'Urgent',
    status: 'New',
    customerId: mara.id,
    teamId: technical.id,
    openedHoursAgo: 2,
    tags: ['outage'],
    messages: [
      {
        body: 'The dashboard shows a blank page for our whole team.',
        fromCustomer: true
      }
    ]
  });
  await ticket({
    reference: 'HD-DEMO04',
    subject: 'Export to CSV',
    priority: 'Low',
    status: 'Resolved',
    customerId: petra.id,
    teamId: technical.id,
    assigneeId: filip.id,
    openedHoursAgo: 48,
    tags: ['feature-request'],
    messages: [
      { body: 'Could the reports be exported to CSV?', fromCustomer: true },
      {
        body: 'They can, use the export button above the table.',
        authorId: filip.id
      }
    ]
  });

  return 'Seeded 4 tickets, HD-DEMO02 is overdue';
}
