import { randomBytes } from 'node:crypto';
import { AuthUser, ErrorCode, Memory, RealtimeError } from '@appweaver/common';
import { inject } from '@appweaver/core';
import { realtimeConfig } from '../config';
import { ConnectionAuth } from './connection';

const KEY_PREFIX = 'realtime:ticket:';

/** The authentication a ticket carries to the connection it opens, always of a user. */
export type RealtimeTicket = ConnectionAuth & { user: AuthUser };

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
    await this._memory.set(
      KEY_PREFIX + token,
      ticket,
      realtimeConfig.TICKET_TTL
    );
    return { ticket: token, expiresIn: realtimeConfig.TICKET_TTL };
  }

  /**
   * Redeems a ticket, which cannot be redeemed again.
   *
   * @param {string} token - The ticket.
   * @return {Promise<RealtimeTicket>} The authentication the ticket carries.
   * @throws {RealtimeError} `REALTIME_TICKET_INVALID` for a missing, expired or redeemed ticket.
   */
  public async redeem(token: string): Promise<RealtimeTicket> {
    const key = KEY_PREFIX + token;
    const ticket =
      /^[\w-]{43}$/.test(token) &&
      (await this._memory.get<RealtimeTicket>(key));

    // Only the first redemption deletes the key, so a ticket opens one connection
    if (!ticket || !(await this._memory.delete(key))) {
      throw new RealtimeError(
        ErrorCode.RealtimeTicketInvalid,
        'Invalid or expired realtime ticket'
      );
    }

    return ticket;
  }
}
