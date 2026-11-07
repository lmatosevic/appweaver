import { appConfig, TemplateEmail, TemplateEngine } from '@appweaver/common';
import {
  EmailService,
  inject,
  LocaleService,
  TranslationParams
} from '@appweaver/core';

/**
 * Sends an account email rendered from the `.html` or `.txt` template of the application, or without one the plain
 * text of the translations. A missing `.subject` template is replaced by the translated subject.
 *
 * @param {EmailService} emailService - The email service sending the email.
 * @param {TemplateEmail} email - The recipient, the template, its data and the locale of the email.
 * @param {string} key - The translation key of the email, i.e. `emails.verifyEmail`.
 * @param {Function} body - Builds the paragraphs of the plain text email from the translate function.
 * @return {Promise<void>} A promise that resolves once the email is queued.
 */
export async function sendAccountEmail(
  emailService: EmailService,
  email: TemplateEmail,
  key: string,
  body: (t: (key: string, params?: TranslationParams) => string) => string[]
): Promise<void> {
  const localeService = inject(LocaleService);
  const t = (translationKey: string, params?: TranslationParams) =>
    localeService.translate(translationKey, email.locale, params);

  const engine = inject(TemplateEngine, false);
  if (engine) {
    const [html, text, subject] = await Promise.all(
      ['html', 'txt', 'subject'].map((format) =>
        engine.hasTemplate(`${email.template}.${format}`, email.locale)
      )
    );
    if (html || text) {
      return emailService.sendEmail(
        subject ? email : { ...email, subject: t(`${key}.subject`) }
      );
    }
  }

  await emailService.sendEmail({
    to: email.to,
    subject: t(`${key}.subject`),
    text: [
      t('emails.greeting'),
      ...body(t),
      `--\n${t('emails.footer', { appName: appConfig.NAME })}`
    ].join('\n\n')
  });
}
