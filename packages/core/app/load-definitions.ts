import { Database } from '../database';
import { Redis } from '../redis';
import { Queue } from '../queue';
import { EmailService, Mailer } from '../mailer';
import { ExportService } from '../export';
import { FileService, Storage } from '../storage';
import { AuthService } from '../security';
import { Scheduler } from '../scheduler';
import { Events } from '../events';
import { HealthService } from '../health';
import { define } from '../context';

/**
 * Loads and initializes the service definitions required by the application.
 * This method registers various service components, such as the database, queue system,
 * mailer, storage, and authentication services, among others.
 */
export function loadDefinitions(): void {
  define(new Database());
  define(new Redis());
  define(new Queue());
  define(new Mailer());
  define(new EmailService());
  define(new ExportService());
  define(new Storage());
  define(new FileService());
  define(new AuthService());
  define(new Scheduler());
  define(new Events());
  define(new HealthService());
}
