import {
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_POLICY_TYPE,
  RESOURCE_ROUTES_TYPE,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE
} from '@appweaver/common';
import { context } from '../../context/context';
import {
  define,
  inject,
  injectAll,
  injectAllWhere,
  injectModel,
  injectPolicy,
  injectRoutes,
  injectService
} from '../../context/dependency-injection';
import { resetContext } from '../fixtures/context-fixture';

const model = (name: string, auth: boolean = false) =>
  ({
    name,
    config: { name },
    [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE,
    [RESOURCE_AUTH]: auth
  }) as any;

const service = (name: string) =>
  ({
    modelName: name,
    [RESOURCE_TYPE]: RESOURCE_SERVICE_TYPE
  }) as any;

const routes = (name: string) =>
  ({
    name,
    [RESOURCE_TYPE]: RESOURCE_ROUTES_TYPE
  }) as any;

const policy = (name: string) =>
  ({
    name,
    [RESOURCE_TYPE]: RESOURCE_POLICY_TYPE
  }) as any;

describe('dependency-injection', () => {
  beforeEach(() => {
    resetContext();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    resetContext();
  });

  describe('define', () => {
    test('registers a plain value under its explicit name', () => {
      define({ url: 'localhost' }, 'DatabaseConfig');

      expect(context.definitions).toEqual([
        { name: 'DatabaseConfig', value: { url: 'localhost' } }
      ]);
    });

    test('registers a value under a symbol name', () => {
      const token = Symbol('Token');

      define({ value: 1 }, token);

      expect(context.definitions[0].name).toBe(token);
    });

    test('infers the name from the class when no name is given', () => {
      class MailerService {}

      define(new MailerService());

      expect(context.definitions[0].name).toBe('MailerService');
    });

    test('infers the name from a constructor definition', () => {
      class MailerService {}

      define(MailerService);

      expect(context.definitions[0].name).toBe('MailerService');
    });

    test('uses the class of the nameOrClass argument as the name', () => {
      abstract class Mailer {}
      class SmtpMailer extends Mailer {}

      define(new SmtpMailer(), Mailer);

      expect(context.definitions[0].name).toBe('Mailer');
    });

    test('registers resource models, services, routes and policies separately', () => {
      define(model('Post'));
      define(service('Post'), 'Post');
      define(routes('Post'), 'Post');
      define(policy('Post'), 'Post');

      expect(context.resource.models.has('Post')).toBe(true);
      expect(context.resource.services.has('Post')).toBe(true);
      expect(context.resource.routes.has('Post')).toBe(true);
      expect(context.resource.policies.has('Post')).toBe(true);
      expect(context.definitions).toHaveLength(0);
    });

    test('keeps the first definition and warns in the default ignore mode', () => {
      define({ value: 'first' }, 'Config');
      define({ value: 'second' }, 'Config');

      expect(context.definitions).toHaveLength(1);
      expect(inject('Config')).toEqual({ value: 'first' });
    });

    test('replaces the existing definition in override mode', () => {
      define({ value: 'first' }, 'Config');
      define({ value: 'second' }, 'Config', 'override');

      expect(context.definitions).toHaveLength(1);
      expect(inject('Config')).toEqual({ value: 'second' });
    });

    test('keeps both definitions in append mode', () => {
      define({ value: 'first' }, 'Config', 'append');
      define({ value: 'second' }, 'Config', 'append');

      expect(context.definitions).toHaveLength(2);
      expect(injectAll('Config')).toEqual([
        { value: 'first' },
        { value: 'second' }
      ]);
    });

    test('throws for a duplicated definition in fail mode', () => {
      define({ value: 'first' }, 'Config');

      expect(() => define({ value: 'second' }, 'Config', 'fail')).toThrow(
        `Definition 'Config' is already present in the application context.`
      );
    });

    test('overrides an existing resource model', () => {
      const updated = model('Post');
      define(model('Post'));
      define(updated, undefined, 'override');

      expect(context.resource.models.get('Post')).toBe(updated);
    });
  });

  describe('inject', () => {
    test('resolves a definition by name', () => {
      define({ port: 5000 }, 'ServerConfig');

      expect(inject('ServerConfig')).toEqual({ port: 5000 });
    });

    test('resolves a definition by class', () => {
      class Mailer {}
      const instance = new Mailer();
      define(instance);

      expect(inject(Mailer)).toBe(instance);
    });

    test('resolves a definition by symbol', () => {
      const token = Symbol('Token');
      const value = { secret: 'value' };
      define(value, token);

      expect(inject(token)).toBe(value);
    });

    test('instantiates a registered class on first injection', () => {
      class Counter {
        public value = 1;
      }
      define(Counter);

      const instance = inject<Counter>('Counter');

      expect(instance).toBeInstanceOf(Counter);
      expect(instance.value).toBe(1);
    });

    test('returns the same instance on subsequent injections', () => {
      class Counter {}
      define(Counter);

      expect(inject('Counter')).toBe(inject('Counter'));
    });

    test('resolves resource definitions by naming convention', () => {
      define(model('Post'));
      define(service('Post'), 'Post');
      define(routes('Post'), 'Post');
      define(policy('Post'), 'Post');

      expect(inject('PostModel')).toBe(context.resource.models.get('Post'));
      expect(inject('PostService')).toBe(context.resource.services.get('Post'));
      expect(inject('PostRoutes')).toBe(context.resource.routes.get('Post'));
      expect(inject('PostPolicy')).toBe(context.resource.policies.get('Post'));
    });

    test('throws for a missing required definition', () => {
      expect(() => inject('Missing')).toThrow(
        `Definition 'Missing' is not defined in the application context`
      );
    });

    test('returns undefined for a missing optional definition', () => {
      expect(inject('Missing', false)).toBeUndefined();
    });
  });

  describe('injectAll', () => {
    test('returns every definition registered under the name', () => {
      define({ id: 1 }, 'Plugin', 'append');
      define({ id: 2 }, 'Plugin', 'append');

      expect(injectAll('Plugin')).toEqual([{ id: 1 }, { id: 2 }]);
    });

    test('returns an empty array when nothing matches', () => {
      expect(injectAll('Plugin')).toEqual([]);
    });

    test('instantiates registered classes', () => {
      class PluginA {}
      define(PluginA, 'Plugin', 'append');

      const [instance] = injectAll('Plugin');

      expect(instance).toBeInstanceOf(PluginA);
    });
  });

  describe('injectAllWhere', () => {
    test('returns definitions matching the search function', () => {
      define({ enabled: true }, 'A', 'append');
      define({ enabled: false }, 'B', 'append');

      const enabled = injectAllWhere<{ enabled: boolean }>(
        (def) => (def.value as any).enabled
      );

      expect(enabled).toEqual([{ enabled: true }]);
    });

    test('supports filtering by definition name', () => {
      define({ id: 1 }, 'Health', 'append');
      define({ id: 2 }, 'Other', 'append');

      expect(injectAllWhere((def) => def.name === 'Health')).toEqual([
        { id: 1 }
      ]);
    });
  });

  describe('injectModel', () => {
    test('returns the registered model', () => {
      const post = model('Post');
      define(post);

      expect(injectModel('Post')).toBe(post);
    });

    test('throws for a missing required model', () => {
      expect(() => injectModel('Post')).toThrow(
        `Model 'Post' is not defined in the application context`
      );
    });

    test('returns undefined for a missing optional model', () => {
      expect(injectModel('Post', false)).toBeUndefined();
    });
  });

  describe('injectService', () => {
    test('returns the registered service', () => {
      const postService = service('Post');
      define(postService, 'Post');

      expect(injectService('Post')).toBe(postService);
    });

    test('instantiates a service class registered for the model', () => {
      class PostService {
        public readonly modelName = 'Post';
      }
      (PostService as any)[RESOURCE_TYPE] = RESOURCE_SERVICE_TYPE;
      define(PostService, 'Post');

      expect(injectService('Post')).toBeInstanceOf(PostService);
    });

    test('throws for a missing required service', () => {
      expect(() => injectService('Post')).toThrow(
        `Service for model 'Post' is not defined in the application context`
      );
    });

    test('returns undefined for a missing optional service', () => {
      expect(injectService('Post', false)).toBeUndefined();
    });
  });

  describe('injectRoutes', () => {
    test('returns the registered routes', () => {
      const postRoutes = routes('Post');
      define(postRoutes, 'Post');

      expect(injectRoutes('Post')).toBe(postRoutes);
    });

    test('throws for missing required routes', () => {
      expect(() => injectRoutes('Post')).toThrow(
        `Routes for model 'Post' are not defined in the application context`
      );
    });

    test('returns undefined for missing optional routes', () => {
      expect(injectRoutes('Post', false)).toBeUndefined();
    });
  });

  describe('injectPolicy', () => {
    test('returns the registered policy', () => {
      const postPolicy = policy('Post');
      define(postPolicy, 'Post');

      expect(injectPolicy('Post')).toBe(postPolicy);
    });

    test('throws for a missing required policy', () => {
      expect(() => injectPolicy('Post')).toThrow(
        `Policy for model 'Post' is not defined in the application context`
      );
    });

    test('returns undefined for a missing optional policy', () => {
      expect(injectPolicy('Post', false)).toBeUndefined();
    });
  });
});
