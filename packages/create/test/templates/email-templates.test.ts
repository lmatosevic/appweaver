import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as common from '@appweaver/common';
import { define, LocaleService } from '@appweaver/core';
import { HandlebarsTemplateEngine } from '@appweaver/handlebars';
import { resetContext } from '@appweaver/testing';
import { htmlToText } from '../../../core/mailer/utils/html-util';
import {
  flattenTranslations,
  inlineTranslations
} from '../../utils/translation-util';

const { configOverrides } = common as unknown as {
  configOverrides: Record<string, unknown>;
};

const modulesDir = path.join(__dirname, '..', '..', 'templates', 'modules');
const templatesDir = path.join(modulesDir, 'mailer+templates', 'templates');
const translationFile = path.join(
  __dirname,
  '..',
  '..',
  'templates',
  'translations',
  'en.json'
);

const emails: [string, Record<string, unknown>][] = [
  ['emails/verify-email', { link: 'https://app.test/verify?token=1' }],
  ['emails/password-reset', { link: 'https://app.test/reset?token=1' }],
  ['emails/two-factor-code', { code: '123456', expiresInMinutes: 1 }],
  ['emails/two-factor-code', { code: '123456', expiresInMinutes: 5 }]
];

describe('email templates', () => {
  let localesDir: string;
  let engine: HandlebarsTemplateEngine;

  beforeEach(() => {
    localesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-locales-'));
    Object.assign(configOverrides, {
      TEMPLATE_PATH: templatesDir,
      TEMPLATE_CACHE: true,
      LOCALE_PATH: localesDir,
      LOCALE_DEFAULT: 'en',
      APP_NAME: 'Test App'
    });

    resetContext();
    define(LocaleService);
    engine = new HandlebarsTemplateEngine();
  });

  afterEach(() => {
    fs.rmSync(localesDir, { recursive: true, force: true });
  });

  afterAll(() => {
    resetContext();
  });

  test('renders the password reset email in the layout', async () => {
    const data = { link: 'https://app.test/reset?token=1' };

    const html = await engine.render('emails/password-reset.html', data);
    const subject = await engine.render('emails/password-reset.subject');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('href="https://app.test/reset?token&#x3D;1"');
    expect(html).toContain('This email was sent by Test App.');
    expect(subject).toBe('Password reset request');
  });

  test('derives a readable text from the HTML', async () => {
    const html = await engine.render('emails/password-reset.html', {
      link: 'https://app.test/reset?token=1'
    });

    const text = htmlToText(html);
    expect(text).toContain('Reset password (https://app.test/reset?token=1)');
    expect(text).toMatch(
      /ignore this email\.\n\nThis email was sent by Test App\.$/
    );
    expect(text).not.toMatch(/[<>]|Password reset request/);
  });

  test('renders the email verification link', async () => {
    const html = await engine.render('emails/verify-email.html', {
      link: 'https://app.test/verify'
    });

    expect(html).toContain('<title>Verify your email address</title>');
    expect(html).toContain('href="https://app.test/verify"');
  });

  test('pluralizes the expiry of the 2FA code', async () => {
    const html = await engine.render('emails/two-factor-code.html', {
      code: '123456',
      expiresInMinutes: 1
    });

    expect(html).toContain('123456');
    expect(html).toContain('The code expires in 1 minute.');
  });

  test('translates the emails with the translation files', async () => {
    fs.writeFileSync(
      path.join(localesDir, 'de.json'),
      JSON.stringify({
        emails: { verifyEmail: { subject: 'E-Mail bestätigen' } }
      })
    );

    expect(
      await engine.render('emails/verify-email.subject', {}, { locale: 'de' })
    ).toBe('E-Mail bestätigen');
  });

  test('renders the same emails with the English texts inlined', async () => {
    const translations = flattenTranslations(
      JSON.parse(fs.readFileSync(translationFile, 'utf8'))
    );
    const inlinedDir = path.join(localesDir, 'templates');
    fs.cpSync(templatesDir, inlinedDir, { recursive: true });
    const templateFiles = fs
      .readdirSync(inlinedDir, { recursive: true })
      .map((file) => path.join(inlinedDir, String(file)))
      .filter((filePath) => filePath.endsWith('.hbs'));
    expect(templateFiles).toHaveLength(8);

    for (const filePath of templateFiles) {
      const inlined = inlineTranslations(
        fs.readFileSync(filePath, 'utf8'),
        translations,
        filePath.endsWith('.html.hbs')
      );
      expect(inlined).not.toMatch(/[{(]t "/);
      fs.writeFileSync(filePath, inlined);
    }
    // Loads the original templates before the path changes
    await engine.onInit();
    configOverrides.TEMPLATE_PATH = inlinedDir;
    const inlinedEngine = new HandlebarsTemplateEngine();
    expect(await inlinedEngine.render('emails/verify-email.subject')).toBe(
      'Verify your email address'
    );

    for (const [email, data] of emails) {
      for (const format of ['subject', 'html']) {
        const name = `${email}.${format}`;
        const expected = await engine.render(name, data);
        expect(expected).not.toBe('');
        expect(await inlinedEngine.render(name, data)).toBe(expected);
      }
    }
  });
});
