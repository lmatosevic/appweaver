export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type SlaTargets = {
  firstResponseMinutes: number;
  resolutionMinutes: number;
};

/** Used for a priority without a policy in the database. */
export const DEFAULT_SLA: Record<Priority, SlaTargets> = {
  Urgent: { firstResponseMinutes: 30, resolutionMinutes: 240 },
  High: { firstResponseMinutes: 120, resolutionMinutes: 1440 },
  Normal: { firstResponseMinutes: 480, resolutionMinutes: 4320 },
  Low: { firstResponseMinutes: 1440, resolutionMinutes: 10080 }
};

/** When the first response and the resolution of a ticket are due. */
export function slaDeadlines(
  openedAt: Date,
  targets: SlaTargets
): { firstResponseDueAt: Date; resolutionDueAt: Date } {
  const after = (minutes: number) =>
    new Date(openedAt.getTime() + minutes * 60_000);

  return {
    firstResponseDueAt: after(targets.firstResponseMinutes),
    resolutionDueAt: after(targets.resolutionMinutes)
  };
}

/** The next priority up, an urgent ticket stays urgent. */
export function escalatedPriority(priority: Priority): Priority {
  const order: Priority[] = ['Low', 'Normal', 'High', 'Urgent'];
  return order[Math.min(order.indexOf(priority) + 1, order.length - 1)];
}
