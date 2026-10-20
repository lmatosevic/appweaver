import { TemplateEngine } from '@appweaver/common';
import { define } from '../../context/dependency-injection';
import {
  registerTemplate,
  registerTemplateHelper,
  registerTemplateHelpers
} from '../../template/register-template';
import { resetContext } from '../fixtures/context-fixture';

describe('register-template', () => {
  let engine: { registerTemplate: jest.Mock; registerHelper: jest.Mock };

  beforeEach(() => {
    resetContext();
    engine = { registerTemplate: jest.fn(), registerHelper: jest.fn() };
    define(engine, TemplateEngine as any);
  });

  afterAll(() => {
    resetContext();
  });

  describe('registerTemplate', () => {
    test('registers the template with the engine', () => {
      registerTemplate('emails/welcome.html', '<p>Hi</p>', 'de');

      expect(engine.registerTemplate).toHaveBeenCalledWith(
        'emails/welcome.html',
        '<p>Hi</p>',
        'de'
      );
    });
  });

  describe('registerTemplateHelper', () => {
    test('registers the helper with the engine', () => {
      const helper = () => 'x';
      registerTemplateHelper('x', helper);

      expect(engine.registerHelper).toHaveBeenCalledWith('x', helper);
    });
  });

  describe('registerTemplateHelpers', () => {
    test('registers every helper with the engine', () => {
      const a = () => 'a';
      const b = () => 'b';
      registerTemplateHelpers({ a, b });

      expect(engine.registerHelper).toHaveBeenCalledWith('a', a);
      expect(engine.registerHelper).toHaveBeenCalledWith('b', b);
    });
  });
});
