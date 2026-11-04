import { createLogger, Scheduler } from '@appweaver/common';
import { inject, TimeSeriesService } from '@appweaver/core';
import db from '@db/client';

const logger = createLogger('metrics');

/** The interval of the points, the one of the job. */
export const METRICS_INTERVAL_MINUTES = 15;

const OPEN_STATUSES = ['New', 'Open', 'Pending'];

// Every 15 minutes, the workload of every team is written to InfluxDB
inject(Scheduler).addJob({
  cronTime: `*/${METRICS_INTERVAL_MINUTES} * * * *`,
  onTick: async () => {
    const teams = await recordTeamMetrics();
    logger.debug(`Team metrics recorded: ${teams}`);
  }
});

/**
 * Records the workload of every team at a time: its open, unassigned and overdue tickets, and the average minutes to
 * the first response of the tickets answered since the previous point.
 *
 * @param {Date} [now] - The time of the points.
 * @return {Promise<number>} The number of teams recorded.
 */
export async function recordTeamMetrics(
  now: Date = new Date()
): Promise<number> {
  const since = new Date(now.getTime() - METRICS_INTERVAL_MINUTES * 60_000);
  const open = { status: { in: OPEN_STATUSES as any } };

  const [teams, tickets, unassigned, overdue, answered] = await Promise.all([
    db.team.findMany({ select: { id: true } }),
    db.ticket.groupBy({ by: ['teamId'], where: open, _count: true }),
    db.ticket.groupBy({
      by: ['teamId'],
      where: { ...open, assigneeId: null },
      _count: true
    }),
    db.ticket.groupBy({
      by: ['teamId'],
      where: { ...open, resolutionDueAt: { lt: now } },
      _count: true
    }),
    db.ticket.findMany({
      where: { firstRespondedAt: { gte: since, lt: now } },
      select: { teamId: true, createdAt: true, firstRespondedAt: true }
    })
  ]);

  const countOf = (
    groups: { teamId: number | null; _count: number }[],
    teamId: number
  ) => groups.find((group) => group.teamId === teamId)?._count ?? 0;

  const points = teams.map(({ id }) => {
    const minutes = answered
      .filter((ticket) => ticket.teamId === id)
      .map(
        (ticket) =>
          (ticket.firstRespondedAt!.getTime() - ticket.createdAt.getTime()) /
          60_000
      );
    const overdueCount = countOf(overdue, id);

    return {
      resourceId: id,
      time: now,
      values: {
        open: countOf(tickets, id),
        unassigned: countOf(unassigned, id),
        overdue: overdueCount,
        breached: overdueCount > 0,
        // Left out without an answered ticket, so the average skips the interval
        ...(minutes.length > 0
          ? {
              firstResponseMinutes:
                Math.round(
                  (minutes.reduce((sum, value) => sum + value, 0) /
                    minutes.length) *
                    10
                ) / 10
            }
          : {})
      }
    };
  });

  if (points.length > 0) {
    await inject(TimeSeriesService).write('Team', points);
  }
  return points.length;
}
