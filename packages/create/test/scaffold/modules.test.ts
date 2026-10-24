import {
  findDependents,
  parseModuleNames,
  resolveModules,
  sortModules
} from '../../scaffold/modules';

describe('modules', () => {
  describe('parseModuleNames', () => {
    test('parses the names given separately or separated by commas', () => {
      expect(parseModuleNames(['docker,Redis', ' mailer ', 'redis'])).toEqual([
        'redis',
        'mailer',
        'docker'
      ]);
    });

    test('rejects an unknown module', () => {
      expect(() => parseModuleNames(['redis', 'cron'])).toThrow(
        'Unknown module: cron. Must be one of following: redis, queue, scheduler, mailer, templates, locales, docker.'
      );
    });
  });

  describe('sortModules', () => {
    test('sorts the modules in the order they are applied', () => {
      expect(sortModules(['docker', 'queue', 'redis', 'queue'])).toEqual([
        'redis',
        'queue',
        'docker'
      ]);
    });
  });

  describe('resolveModules', () => {
    test('adds the required modules', () => {
      expect(resolveModules(['queue', 'mailer'])).toEqual({
        modules: ['redis', 'queue', 'mailer'],
        required: [['redis', 'queue']]
      });
    });

    test('leaves out the excluded modules', () => {
      expect(resolveModules(['redis', 'docker'], ['docker']).modules).toEqual([
        'redis'
      ]);
    });

    test('rejects excluding a required module', () => {
      expect(() => resolveModules(['queue'], ['redis'])).toThrow(
        'Module queue requires redis, leave out queue as well.'
      );
      expect(resolveModules(['queue', 'redis'], ['redis', 'queue'])).toEqual({
        modules: [],
        required: []
      });
    });
  });

  describe('findDependents', () => {
    test('finds the remaining modules requiring a removed one', () => {
      expect(findDependents(['redis'], ['redis', 'queue', 'docker'])).toEqual([
        ['queue', 'redis']
      ]);
      expect(findDependents(['redis', 'queue'], ['redis', 'queue'])).toEqual(
        []
      );
    });
  });
});
