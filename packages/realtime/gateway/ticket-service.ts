import { randomBytes } from 'node:crypto';
import { AuthUser, ErrorCode, Memory, RealtimeError } from '@appweaver/common';
import { inject } from '@appweaver/core';
import { realtimeConfig } from '../config';
import { loadAuthUser } from '../utils/auth-user';
import { ConnectionAuth } from './connection';

const KEY_PREFIX = 'realtime:ticket:';

/** The authentication a ticket carries to the connection it opens, always of a user. */
export type RealtimeTicket = ConnectionAuth & {
  user: AuthUser;
  /** The epoch milliseconds the ticket was issued at, set by {@link TicketService.issue} */
  issuedAt?: number;
};

/**
 * Issues and redeems the tickets of the realtime connections. A browser cannot send the `Authorization` header with
 * an `EventSource` or a `WebSocket`, so a client asks for a short-lived ticket with its credentials, and opens the
 * connection with the ticket in the URL, used once and kept in the memory, so it is valid on every instance.
 */
export class TicketService {
  /** @internal */
  private readonly _memory = inject(Memory);

  /**
   * Issues a ticket.
   *
   * @param {RealtimeTicket} ticket - The authentication the ticket carries.
   * @return {Promise<{ ticket: string; expiresIn: number }>} The ticket and the milliseconds it is valid for.
   */
  public async issue(
    ticket: RealtimeTicket
  ): Promise<{ ticket: string; expiresIn: number }> {
    const token = randomBytes(32).toString('base64url');
    // The password hash is never needed by a connection, so it stays out of
    // the memory, i.e. a Redis server
    const { passwordHash: _passwordHash, ...user } = ticket.user;
    await this._memory.set(
      KEY_PREFIX + token,
      { ...ticket, user, issuedAt: Date.now() },
      realtimeConfig.TICKET_TTL
    );
    return { ticket: token, expiresIn: realtimeConfig.TICKET_TTL };
  }

  /**
   * Redeems a ticket, which cannot be redeemed again, with the user of the auth model loaded as it is now.
   *
   * @param {string} token - The ticket.
   * @return {Promise<RealtimeTicket>} The authentication the ticket carries.
   * @throws {RealtimeError} `REALTIME_TICKET_INVALID` for a missing, expired or redeemed ticket, or one of a user
   * deleted, disabled or logged out since it was issued.
   */
  public async redeem(token: string): Promise<RealtimeTicket> {
    const key = KEY_PREFIX + token;
    const ticket =
      /^[\w-]{43}$/.test(token) &&
      (await this._memory.get<RealtimeTicket>(key));

    // Only the first redemption deletes the key, so a ticket opens one connection
    if (!ticket || !(await this._memory.delete(key))) {
      throw invalidTicket();
    }

    const user = await loadAuthUser(ticket.user.id);
    if (user === undefined) {
      return ticket;
    }
    if (
      !user ||
      user.enabled === false ||
      (user.logoutAt &&
        new Date(user.logoutAt).getTime() > (ticket.issuedAt ?? 0))
    ) {
      throw invalidTicket();
    }

    return { ...ticket, user };
  }
}

function invalidTicket(): RealtimeError {
  return new RealtimeError(
    ErrorCode.RealtimeTicketInvalid,
    'Invalid or expired realtime ticket'
  );
}
