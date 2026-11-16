import { AuthType, ErrorCode, Memory } from '@appweaver/common';
import { define } from '@appweaver/core';
import { InMemory } from '@appweaver/core/drivers';
import { resetContext } from '@appweaver/testing';
import { TicketService } from '../../gateway/ticket-service';

describe('TicketService', () => {
  let tickets: TicketService;
  const ticket = {
    user: { id: 1, email: 'u@test.com', roles: [] },
    authType: AuthType.Jwt,
    authSource: null,
    expiresAt: 123
  };

  beforeEach(() => {
    resetContext();
    define(new InMemory(), Memory);
    tickets = new TicketService();
  });

  test('redeems a ticket once', async () => {
    const { ticket: token, expiresIn } = await tickets.issue(ticket);

    await expect(tickets.redeem(token)).resolves.toEqual(ticket);
    await expect(tickets.redeem(token)).rejects.toMatchObject({
      code: ErrorCode.RealtimeTicketInvalid
    });
    expect(expiresIn).toBe(30000);
  });

  test('keeps the password hash out of the memory', async () => {
    const { ticket: token } = await tickets.issue({
      ...ticket,
      user: { ...ticket.user, passwordHash: 'hash' }
    });

    const redeemed = await tickets.redeem(token);

    expect(redeemed.user).toEqual(ticket.user);
    expect(redeemed.user).not.toHaveProperty('passwordHash');
  });

  test('refuses a malformed ticket', async () => {
    await expect(tickets.redeem('../keys')).rejects.toMatchObject({
      code: ErrorCode.RealtimeTicketInvalid
    });
  });
});
