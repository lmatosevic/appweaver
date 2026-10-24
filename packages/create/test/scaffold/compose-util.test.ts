import { parse } from 'yaml';
import {
  addRedisService,
  removeRedisService
} from '../../scaffold/compose-util';

const compose = `services:
  postgres:
    image: postgres:18.4
    environment:
      POSTGRES_DB: "app"

  app.migrations:
    build:
      context: .
    env_file:
      - .env
    command: [ "migrations" ]

  app.seed:
    build:
      context: .
    env_file:
      - .env
    environment:
      DB_HOST: "postgres"
    command: [ "seed" ]

  app:
    build:
      context: .
    depends_on:
      app.seed:
        condition: service_completed_successfully
    env_file:
      - .env
    networks:
      - app

# The volumes of the services
volumes:
  postgres-data:
`;

describe('compose-util', () => {
  describe('addRedisService', () => {
    const result = addRedisService(compose, 'app');
    const services = parse(result).services;

    test('adds the Redis service after the database service', () => {
      expect(Object.keys(services)).toEqual([
        'postgres',
        'redis',
        'app.migrations',
        'app.seed',
        'app'
      ]);
      expect(services.redis.image).toBe('redis:7.4.9');
      expect(result).toContain(
        '      POSTGRES_DB: "app"\n\n  redis:\n    image: redis:7.4.9\n'
      );
      expect(result).toContain('      - app\n\n  app.migrations:\n');
    });

    test('points the application services at the Redis host', () => {
      expect(services['app.migrations'].environment).toEqual({
        REDIS_HOST: 'redis'
      });
      expect(services['app.seed'].environment).toEqual({
        DB_HOST: 'postgres',
        REDIS_HOST: 'redis'
      });
      expect(result).toContain(
        '    env_file:\n      - .env\n    environment:\n      REDIS_HOST: "redis"\n    command: [ "migrations" ]\n'
      );
    });

    test('starts the application after Redis', () => {
      expect(Object.keys(services.app.depends_on)).toEqual([
        'redis',
        'app.seed'
      ]);
    });

    test('adds the named volume, keeping the comments', () => {
      expect(result).toContain(
        '# The volumes of the services\nvolumes:\n  postgres-data:\n  redis-data:\n'
      );
    });

    test('keeps a file that has the Redis service', () => {
      expect(addRedisService(result, 'app')).toBe(result);
    });

    test('adds the Redis service first without a database service', () => {
      const withoutDatabase = compose.replace(
        / {2}postgres:\n.*\n.*\n.*\n\n/,
        ''
      );

      const added = addRedisService(withoutDatabase, 'app');

      expect(added).toMatch(/^services:\n {2}redis:\n/);
      expect(added).toContain('      - app\n\n  app.migrations:\n');
    });
  });

  describe('removeRedisService', () => {
    test('restores the file of addRedisService', () => {
      expect(removeRedisService(addRedisService(compose, 'app'), 'app')).toBe(
        compose
      );
    });

    test('restores a file without a database service', () => {
      const withoutDatabase = compose.replace(
        / {2}postgres:\n.*\n.*\n.*\n\n/,
        ''
      );

      expect(
        removeRedisService(addRedisService(withoutDatabase, 'app'), 'app')
      ).toBe(withoutDatabase);
    });
  });
});
