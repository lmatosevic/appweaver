import path from 'node:path';
import { sourceLoggerNames } from '@appweaver/testing';
import * as sections from '../config';
import manifest from '../module';

describe('module', () => {
  test('lists every config section of the package', () => {
    const all = Object.values(sections).filter((value) =>
      Object.isFrozen(value)
    );

    expect(new Set(manifest.config)).toEqual(new Set(all));
  });

  test('lists every logger of the package', () => {
    expect([...(manifest.loggers ?? [])].sort()).toEqual(
      sourceLoggerNames(path.join(__dirname, '..'))
    );
  });

  test('loads the ticket service and the gateway', async () => {
    const [tickets, gateway] = manifest.services ?? [];

    expect(await tickets.load()).toHaveProperty('TicketService');
    expect(await gateway.load()).toHaveProperty('RealtimeGateway');
  });

  test('requires the web module', () => {
    expect(manifest.requires).toEqual(['@appweaver/web']);
  });
});
