import {
  DEFAULT_SLA,
  escalatedPriority,
  slaDeadlines
} from '@/features/sla/sla';

describe('slaDeadlines', () => {
  test('adds the targets to the opening time', () => {
    const openedAt = new Date('2026-09-27T08:00:00.000Z');

    const deadlines = slaDeadlines(openedAt, {
      firstResponseMinutes: 30,
      resolutionMinutes: 240
    });

    expect(deadlines).toEqual({
      firstResponseDueAt: new Date('2026-09-27T08:30:00.000Z'),
      resolutionDueAt: new Date('2026-09-27T12:00:00.000Z')
    });
  });

  test('gives urgent tickets the tightest default targets', () => {
    const minutes = Object.values(DEFAULT_SLA).map(
      (targets) => targets.resolutionMinutes
    );

    expect(DEFAULT_SLA.Urgent.resolutionMinutes).toBe(Math.min(...minutes));
  });
});

describe('escalatedPriority', () => {
  test.each([
    ['Low', 'Normal'],
    ['Normal', 'High'],
    ['High', 'Urgent'],
    ['Urgent', 'Urgent']
  ] as const)('escalates %s to %s', (priority, escalated) => {
    expect(escalatedPriority(priority)).toBe(escalated);
  });
});
