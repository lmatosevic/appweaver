import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as common from '@appweaver/common';
import { define, LocaleService } from '@appweaver/core';
import { HandlebarsTemplateEngine } from '@appweaver/handlebars';
import { resetContext } from '@appweaver/testing';
import {
  flattenTranslations,
  inlineTranslations
} from '../../utils/translation-util';

const { configOverrides } = common as unknown as {
  configOverrides: Record<string, unknown>;
};

const templatesDir = path.join(
  __dirname,
  '..',
  '..',
  'templates',
  'modules',
  'sms+templates',
  'templates'
);
const translationFile = path.join(
  __dirname,
  '..',
  '..',
  'templates',
  'translations',
  'en.json'
);

const messages: [string, number, string][] = [
  [
    'sms/two-factor-code',
    1,
    '123456 is your Test App verification code. It expires in 1 minute.'
  ],
  [
    'sms/two-factor-code',
    5,
    '123456 is your Test App verification code. It expires in 5 minutes.'
  ],
  [
    'sms/verify-phone',
    10,
    '123456 is your Test App phone verification code. It expires in 10 minutes.'
  ]
];

describe('sms templates', () => {
  let localesDir: string;
  let engine: HandlebarsTemplateEngine;

  beforeEach(() => {
    localesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-sms-'));
    Object.assign(configOverrides, {
      TEMPLATE_PATH: templatesDir,
      TEMPLATE_CACHE: true,
      LOCALE_PATH: localesDir,
      LOCALE_DEFAULT: 'en'
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

  test.each(messages)(
    'renders %s for %p minutes',
    async (template, expiresInMinutes, text) => {
      const rendered = await engine.render(`${template}.txt`, {
        code: '123456',
        appName: 'Test App',
        expiresInMinutes
      });

      expect(rendered.trim()).toBe(text);
    }
  );

  test('renders the same messages with the English texts inlined', async () => {
    const translations = flattenTranslations(
      JSON.parse(fs.readFileSync(translationFile, 'utf8'))
    );
    const inlinedDir = path.join(localesDir, 'templates');
    fs.cpSync(templatesDir, inlinedDir, { recursive: true });
    const templateFiles = fs
      .readdirSync(inlinedDir, { recursive: true })
      .map((file) => path.join(inlinedDir, String(file)))
      .filter((filePath) => filePath.endsWith('.hbs'));
    expect(templateFiles).toHaveLength(2);

    for (const filePath of templateFiles) {
      const inlined = inlineTranslations(
        fs.readFileSync(filePath, 'utf8'),
        translations,
        false
      );
      expect(inlined).not.toMatch(/[{(]t "/);
      fs.writeFileSync(filePath, inlined);
    }
    configOverrides.TEMPLATE_PATH = inlinedDir;
    const inlinedEngine = new HandlebarsTemplateEngine();

    for (const [template, expiresInMinutes, text] of messages) {
      const rendered = await inlinedEngine.render(`${template}.txt`, {
        code: '123456',
        appName: 'Test App',
        expiresInMinutes
      });
      expect(rendered.trim()).toBe(text);
    }
  });
});
