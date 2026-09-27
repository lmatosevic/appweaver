import * as core from '../index';
import { CacheService } from '../cache';
import { EmailService } from '../mailer/email-service';
import { FileService } from '../storage/file-service';

describe('index', () => {
  test('exports the services an application injects', () => {
    expect(core.CacheService).toBe(CacheService);
    expect(core.EmailService).toBe(EmailService);
    expect(core.FileService).toBe(FileService);
  });
});
