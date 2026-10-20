import * as core from '../index';
import { CacheService } from '../cache';
import { EmailService } from '../mailer/email-service';
import { LocaleService, registerTranslations } from '../locale';
import { registerTemplate, registerTemplateHelper } from '../template';
import { FileService } from '../storage/file-service';

describe('index', () => {
  test('exports the services an application injects', () => {
    expect(core.CacheService).toBe(CacheService);
    expect(core.EmailService).toBe(EmailService);
    expect(core.FileService).toBe(FileService);
    expect(core.LocaleService).toBe(LocaleService);
  });

  test('exports the template and translation registration', () => {
    expect(core.registerTemplate).toBe(registerTemplate);
    expect(core.registerTemplateHelper).toBe(registerTemplateHelper);
    expect(core.registerTranslations).toBe(registerTranslations);
  });

  test('exports the config sections of the modules', () => {
    expect(core.serverConfig).toBeDefined();
    expect(core.databaseConfig).toBeDefined();
    expect(core.securityConfig).toBeDefined();
  });
});
