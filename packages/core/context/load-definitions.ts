import { db } from '../database';
import { events } from '../events';
import { mailer } from '../mailer';
import { queue } from '../queue';
import { redis } from '../redis';
import { scheduler } from '../scheduler';
import { storage } from '../storage';
import { define } from './dependency-injection';

export function loadDefinitions(): void {
  define(db);
  define(events);
  define(mailer);
  define(queue);
  define(redis);
  define(scheduler);
  define(storage);
}
