import { runTransaction } from '@appweaver/data';
import db from '@db/client';
import { Prisma } from '@db/client/client';
import { SIGNAL_LOST_MINUTES } from '@/features/telemetry/rules';

/**
 * Ends the active trips of the vehicles silent for `SIGNAL_LOST_MINUTES`, at their last ping, raising a warning for
 * each. Returns the number of trips ended.
 */
export async function endSilentTrips(now: Date = new Date()): Promise<number> {
  const silentSince = new Date(now.getTime() - SIGNAL_LOST_MINUTES * 60_000);
  const trips = await db.trip.findMany({
    where: {
      status: 'Active',
      vehicle: {
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: silentSince } }]
      }
    },
    include: { vehicle: true }
  });

  for (const trip of trips) {
    const { vehicle } = trip;
    const lastSeenAt = vehicle.lastSeenAt ?? trip.startedAt;
    const position = (vehicle.position ??
      trip.startPosition) as Prisma.InputJsonValue;
    await runTransaction(async (tx: Prisma.TransactionClient) => {
      // Conditional, so a ping arriving meanwhile keeps the trip going
      const { count } = await tx.trip.updateMany({
        where: { id: trip.id, status: 'Active' },
        data: {
          status: 'Completed',
          endedAt: lastSeenAt,
          endPosition: position,
          endReason: 'SignalLost'
        }
      });
      if (count === 0) {
        return;
      }
      await tx.alert.create({
        data: {
          type: 'SignalLost',
          severity: 'Warning',
          message: `${vehicle.name} sent no signal for ${SIGNAL_LOST_MINUTES} minutes during a trip`,
          occurredAt: now,
          position,
          vehicleId: vehicle.id,
          tripId: trip.id
        }
      });
    });
  }
  return trips.length;
}
