import * as core from '../index';
import { CacheService } from '../cache/cache-service';
import { EmailService } from '../mailer';
import { LocaleService } from '../locale/locale-service';
import { registerTranslations } from '../locale';
import {
  registerTemplate,
  registerTemplateHelper
} from '../template/register-template';

describe('index', () => {
  test('exports the services an application injects', () => {
    expect(core.CacheService).toBe(CacheService);
    expect(core.EmailService).toBe(EmailService);
    expect(core.LocaleService).toBe(LocaleService);
  });

  test('exports the template and translation registration', () => {
    expect(core.registerTemplate).toBe(registerTemplate);
    expect(core.registerTemplateHelper).toBe(registerTemplateHelper);
    expect(core.registerTranslations).toBe(registerTranslations);
  });

  test('exports the config sections of core', () => {
    expect(core.memoryConfig).toBeDefined();
    expect(core.mailerConfig).toBeDefined();
    expect(core.storageConfig).toBeDefined();
  });
});
