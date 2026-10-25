import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as common from '@appweaver/common';
import { ErrorCode, TemplateEngine } from '@appweaver/common';
import Fastify from 'fastify';
import { define, LocaleService } from '@appweaver/core';
import { errorHandler } from '../../errors/error-handler';
import { ProblemDetailsSchema } from '../../errors';
import { templatePreview } from '../../template/template-preview-route';
import { HandlebarsTemplateEngine } from '@appweaver/handlebars';
import { requestValidation } from '../../server/request-validation';
import { Server } from '../../types/server';
import { resetContext } from '@appweaver/testing';

const { configOverrides } = common as unknown as {
  configOverrides: Record<string, unknown>;
};

describe('template-preview-route', () => {
  let dir: string;
  let server: Server;
  let authenticate: jest.Mock;

  const writeFile = (relativePath: string, content: string) => {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };

  const startServer = async (withEngine = true) => {
    resetContext();
    define(new LocaleService(), LocaleService);
    if (withEngine) {
      const engine = new HandlebarsTemplateEngine();
      await engine.onInit();
      define(engine, TemplateEngine as any);
    }

    server = Fastify(requestValidation());
    server.setErrorHandler(errorHandler);
    server.addSchema(ProblemDetailsSchema);
    server.decorate('authenticate', () => authenticate);
    server.register(templatePreview, { prefix: '/templates' });
    await server.ready();
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-preview-'));
    Object.assign(configOverrides, {
      TEMPLATE_PATH: path.join(dir, 'templates'),
      TEMPLATE_CACHE: true,
      TEMPLATE_PREVIEW_AUTH: false,
      LOCALE_PATH: path.join(dir, 'locales'),
      LOCALE_DEFAULT: 'en'
    });
    authenticate = jest.fn(async () => {});

    writeFile('locales/en.json', JSON.stringify({ greeting: 'Hello {name}' }));
    writeFile('locales/de.json', JSON.stringify({ greeting: 'Hallo {name}' }));
    writeFile(
      'templates/emails/order.html.hbs',
      '<h1>{{t "greeting" name=user.name}}</h1>' +
        '{{#each items}}<li>{{name}}: {{price}}</li>{{/each}}' +
        '{{#if paid}}<b>Paid</b>{{/if}}'
    );
    writeFile('templates/emails/order.de.txt.hbs', 'Bestellung {{number}}');
    writeFile('templates/emails/order.txt.hbs', 'Order {{number}}');
  });

  afterEach(async () => {
    await server.close().catch(() => undefined);
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  afterAll(() => {
    resetContext();
  });

  describe('templatePreview', () => {
    test('renders a template with the data of the query parameters', async () => {
      await startServer();

      const response = await server.inject({
        method: 'GET',
        url: '/templates/emails/order.html',
        query: {
          'user.name': 'Ana <3',
          'items.0.name': 'Book',
          'items.0.price': '10',
          'items.1.name': 'Pen',
          'items.1.price': '2',
          paid: 'false'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.headers['content-security-policy']).toBe('sandbox');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toBe(
        '<h1>Hello Ana &lt;3</h1><li>Book: 10</li><li>Pen: 2</li>'
      );
    });

    test('renders a template in the locale of the parameter', async () => {
      await startServer();

      const response = await server.inject({
        method: 'GET',
        url: '/templates/emails/order.txt?_locale=de&number=WS-1'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe(
        'text/plain; charset=utf-8'
      );
      expect(response.body).toBe('Bestellung WS-1');
    });

    test('renders a template with the JSON data', async () => {
      await startServer();

      const data = JSON.stringify({ user: { name: 'Ana' }, paid: true });
      const response = await server.inject({
        method: 'GET',
        url: '/templates/emails/order.html',
        query: { _data: data, _locale: 'de' }
      });

      expect(response.body).toBe('<h1>Hallo Ana</h1><b>Paid</b>');
    });

    test('responds with not found for a missing template', async () => {
      await startServer();

      const response = await server.inject({
        method: 'GET',
        url: '/templates/emails/missing.html'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        code: ErrorCode.TemplatePreviewNotFound,
        details: { template: 'emails/missing.html' }
      });
    });

    test('responds with bad request for invalid JSON data', async () => {
      await startServer();

      const response = await server.inject({
        method: 'GET',
        url: '/templates/emails/order.html?_data=%7Binvalid'
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: ErrorCode.MalformedRequest
      });
    });

    test('authenticates the requests when configured', async () => {
      configOverrides.TEMPLATE_PREVIEW_AUTH = true;
      await startServer();

      await server.inject({
        method: 'GET',
        url: '/templates/emails/order.txt'
      });

      expect(authenticate).toHaveBeenCalledTimes(1);
    });

    test('skips the authentication when disabled', async () => {
      await startServer();

      await server.inject({
        method: 'GET',
        url: '/templates/emails/order.txt'
      });

      expect(authenticate).not.toHaveBeenCalled();
    });

    test('logs the route once registered', async () => {
      const info = jest
        .spyOn(common.createLogger('template'), 'info')
        .mockImplementation();
      await startServer();

      expect(info).toHaveBeenCalledWith(
        "Template preview enabled on '/templates/*'"
      );
    });

    test('logs that the route requires authentication', async () => {
      configOverrides.TEMPLATE_PREVIEW_AUTH = true;
      const info = jest
        .spyOn(common.createLogger('template'), 'info')
        .mockImplementation();
      await startServer();

      expect(info).toHaveBeenCalledWith(
        "Template preview enabled on '/templates/*', requiring authentication"
      );
    });

    test('fails to register without a template engine', async () => {
      await expect(startServer(false)).rejects.toMatchObject({
        code: ErrorCode.ConfigurationInvalid
      });
    });
  });
});
