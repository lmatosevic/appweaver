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
  'mcp+templates',
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

/** The pages, their data and the texts they show. */
const pages: [string, object, string[]][] = [
  [
    'sign-in',
    {
      client: 'Agent',
      host: 'localhost:3333',
      providers: [{ name: 'google', url: '/auth/login/google?a=1&b=2' }]
    },
    [
      'Agent of localhost:3333 asks to act as you. Sign in with:',
      'href="/auth/login/google?a&#x3D;1&amp;b&#x3D;2"'
    ]
  ],
  [
    'password',
    { action: '/oauth/sign-in', state: 's1', error: 'Wrong' },
    [
      'Confirm your password',
      'Enter its password to link this sign-in to it.',
      'name="state" value="s1"',
      'role="alert">Wrong<'
    ]
  ],
  [
    'two-factor',
    {
      action: '/oauth/sign-in',
      state: 's2',
      hint: 'Enter the code we sent to u***@test.com.',
      methods: [
        { value: 'Email', label: 'Email', selected: true },
        { value: 'Recovery', label: 'Recovery code', selected: false }
      ]
    },
    [
      'Two-factor authentication',
      'Enter the code we sent to u***@test.com.',
      '<option value="Email" selected>Email</option>',
      '<option value="Recovery">Recovery code</option>',
      'Send a new code'
    ]
  ],
  ['error', { message: 'Expired' }, ['Sign-in failed', '<p>Expired</p>']]
];

describe('mcp templates', () => {
  let localesDir: string;

  const render = (
    engine: HandlebarsTemplateEngine,
    page: string,
    data: object
  ) => engine.render(`mcp/${page}.html`, data);

  beforeEach(() => {
    localesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-mcp-'));
    Object.assign(configOverrides, {
      TEMPLATE_PATH: templatesDir,
      TEMPLATE_CACHE: true,
      LOCALE_PATH: localesDir,
      LOCALE_DEFAULT: 'en'
    });
    resetContext();
    define(LocaleService);
  });

  afterEach(() => {
    fs.rmSync(localesDir, { recursive: true, force: true });
  });

  afterAll(() => {
    resetContext();
  });

  test.each(pages)('renders the %s page', async (page, data, texts) => {
    const html = await render(new HandlebarsTemplateEngine(), page, data);

    for (const text of texts) {
      expect(html).toContain(text);
    }
  });

  test('renders the same pages with the English texts inlined', async () => {
    const translations = flattenTranslations(
      JSON.parse(fs.readFileSync(translationFile, 'utf8'))
    );
    const inlinedDir = path.join(localesDir, 'templates');
    fs.cpSync(templatesDir, inlinedDir, { recursive: true });
    const templateFiles = fs
      .readdirSync(inlinedDir, { recursive: true })
      .map((file) => path.join(inlinedDir, String(file)))
      .filter((filePath) => filePath.endsWith('.hbs'));
    expect(templateFiles).toHaveLength(5);
    for (const filePath of templateFiles) {
      const inlined = inlineTranslations(
        fs.readFileSync(filePath, 'utf8'),
        translations,
        true
      );
      expect(inlined).not.toMatch(/[{(]t "/);
      fs.writeFileSync(filePath, inlined);
    }
    const engine = new HandlebarsTemplateEngine();
    const expected = await Promise.all(
      pages.map(([page, data]) => render(engine, page, data))
    );
    configOverrides.TEMPLATE_PATH = inlinedDir;
    const inlinedEngine = new HandlebarsTemplateEngine();

    for (const [i, [page, data]] of pages.entries()) {
      expect(await render(inlinedEngine, page, data)).toBe(expected[i]);
    }
  });
});
