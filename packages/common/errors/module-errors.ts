import { AppweaverError } from './appweaver-error';
import { ModuleErrorCode } from './error-code';

/** An error of the application context, i.e. a definition that is not found. */
export class ContextError<
  C extends ModuleErrorCode<'CONTEXT'> = ModuleErrorCode<'CONTEXT'>
> extends AppweaverError<C> {
  public readonly module = 'context';
}

/** An error of the modules of the application, i.e. a required module that is not enabled. */
export class ModuleError<
  C extends ModuleErrorCode<'MODULE'> = ModuleErrorCode<'MODULE'>
> extends AppweaverError<C> {
  public readonly module = 'module';
}

/**
 * An error of a database operation, i.e. a violated constraint. Raised from the errors of the database client.
 */
export class DatabaseError<
  C extends ModuleErrorCode<'DATABASE'> = ModuleErrorCode<'DATABASE'>
> extends AppweaverError<C> {
  public readonly module = 'database';
}

/** An error of a resource operation, i.e. a resource that is not found or an invalid query. */
export class ResourceError<
  C extends ModuleErrorCode<'RESOURCE'> = ModuleErrorCode<'RESOURCE'>
> extends AppweaverError<C> {
  public readonly module = 'resource';
}

/** An error of a data export. */
export class ExportError<
  C extends ModuleErrorCode<'EXPORT'> = ModuleErrorCode<'EXPORT'>
> extends AppweaverError<C> {
  public readonly module = 'export';
}

/** An error of a queue, i.e. a job sent to a closed queue. */
export class QueueError<
  C extends ModuleErrorCode<'QUEUE'> = ModuleErrorCode<'QUEUE'>
> extends AppweaverError<C> {
  public readonly module = 'queue';
}

/** An error of a file operation, i.e. a file that is not found or exceeds a limit. */
export class FileError<
  C extends ModuleErrorCode<'FILE'> = ModuleErrorCode<'FILE'>
> extends AppweaverError<C> {
  public readonly module = 'file';
}

/** An error of loading the translations. */
export class LocaleError<
  C extends ModuleErrorCode<'LOCALE'> = ModuleErrorCode<'LOCALE'>
> extends AppweaverError<C> {
  public readonly module = 'locale';
}

/** An error of sending an email. */
export class MailerError<
  C extends ModuleErrorCode<'MAILER'> = ModuleErrorCode<'MAILER'>
> extends AppweaverError<C> {
  public readonly module = 'mailer';
}

/** An error of a lock on a shared resource. */
export class LockError<
  C extends ModuleErrorCode<'LOCK'> = ModuleErrorCode<'LOCK'>
> extends AppweaverError<C> {
  public readonly module = 'lock';
}

/** An error of the memory, i.e. a Redis server that is down or not responding. */
export class MemoryError<
  C extends ModuleErrorCode<'MEMORY'> = ModuleErrorCode<'MEMORY'>
> extends AppweaverError<C> {
  public readonly module = 'memory';
}

/** An error of loading or rendering a template. */
export class TemplateError<
  C extends ModuleErrorCode<'TEMPLATE'> = ModuleErrorCode<'TEMPLATE'>
> extends AppweaverError<C> {
  public readonly module = 'template';
}

/** An error of the authentication or the authorization of a user. */
export class AuthError<
  C extends ModuleErrorCode<'AUTH'> = ModuleErrorCode<'AUTH'>
> extends AppweaverError<C> {
  public readonly module = 'auth';
}

/** An error of an account operation, i.e. an email verification or a password reset. */
export class AccountError<
  C extends ModuleErrorCode<'ACCOUNT'> = ModuleErrorCode<'ACCOUNT'>
> extends AppweaverError<C> {
  public readonly module = 'account';
}

/** An error of an OAuth2 sign-in, i.e. a failed provider request. */
export class OAuth2Error<
  C extends ModuleErrorCode<'OAUTH2'> = ModuleErrorCode<'OAUTH2'>
> extends AppweaverError<C> {
  public readonly module = 'oauth2';
}

/** An error of a reCAPTCHA verification. */
export class RecaptchaError<
  C extends ModuleErrorCode<'RECAPTCHA'> = ModuleErrorCode<'RECAPTCHA'>
> extends AppweaverError<C> {
  public readonly module = 'recaptcha';
}

/** An error of a Cloudflare Turnstile verification. */
export class TurnstileError<
  C extends ModuleErrorCode<'TURNSTILE'> = ModuleErrorCode<'TURNSTILE'>
> extends AppweaverError<C> {
  public readonly module = 'turnstile';
}
