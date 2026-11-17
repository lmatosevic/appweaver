// The users of the auth model as they are now, `undefined` for no auth model
const mockUsers: { current?: Map<number, object | null> } = {};
jest.mock('../../utils/auth-user', () => ({
  loadAuthUser: async (id: number) =>
    mockUsers.current ? (mockUsers.current.get(id) ?? null) : undefined
}));

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

    await expect(tickets.redeem(token)).resolves.toEqual({
      ...ticket,
      issuedAt: expect.any(Number)
    });
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
    expect(redeemed.issuedAt).toEqual(expect.any(Number));
    expect(redeemed.user).not.toHaveProperty('passwordHash');
  });

  describe('with an auth model', () => {
    afterEach(() => {
      mockUsers.current = undefined;
    });

    test('redeems the user as it is now', async () => {
      const now = { ...ticket.user, roles: [{ id: 2, name: 'admin' }] };
      mockUsers.current = new Map([[1, now]]);
      const { ticket: token } = await tickets.issue(ticket);

      expect((await tickets.redeem(token)).user).toEqual(now);
    });

    test.each([
      ['deleted', null],
      ['disabled', { ...ticket.user, enabled: false }],
      ['logged out', { ...ticket.user, logoutAt: new Date(Date.now() + 1000) }]
    ])('refuses the ticket of a user %s since', async (_, now) => {
      mockUsers.current = new Map([[1, now]]);
      const { ticket: token } = await tickets.issue(ticket);

      await expect(tickets.redeem(token)).rejects.toMatchObject({
        code: ErrorCode.RealtimeTicketInvalid
      });
    });

    test('redeems the ticket of a user logged out before it was issued', async () => {
      mockUsers.current = new Map([
        [1, { ...ticket.user, logoutAt: new Date(Date.now() - 1000) }]
      ]);
      const { ticket: token } = await tickets.issue(ticket);

      await expect(tickets.redeem(token)).resolves.toBeDefined();
    });
  });

  test('refuses a malformed ticket', async () => {
    await expect(tickets.redeem('../keys')).rejects.toMatchObject({
      code: ErrorCode.RealtimeTicketInvalid
    });
  });
});
