import { parse } from 'yaml';
import {
  addDatabaseServices,
  addRedisService,
  addServerPort,
  removeDatabaseServices,
  removeRedisService,
  removeServerPort
} from '../../scaffold/compose-util';
import { ProjectContext } from '../../scaffold/types';

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

/** The docker-compose.yml of an application without the data and web modules. */
const appCompose = `services:
  app:
    image: app:latest
    build:
      context: .
    volumes:
      - ./storage:/usr/app/storage
    env_file:
      - .env
    networks:
      - app

networks:
  app:
    driver: bridge
`;

const context: ProjectContext = {
  name: 'app',
  host: '0.0.0.0',
  port: 5000,
  runtime: 'node',
  database: 'postgresql'
};

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

    test('restores a file without application dependencies and volumes', () => {
      const added = addRedisService(appCompose, 'app');
      expect(parse(added).services.app.depends_on).toEqual({
        redis: { condition: 'service_healthy' }
      });
      expect(added).toContain('\n\nvolumes:\n  redis-data:\n');

      expect(removeRedisService(added, 'app')).toBe(appCompose);
    });
  });

  describe('addDatabaseServices', () => {
    const result = addDatabaseServices(appCompose, context);
    const services = parse(result).services;

    test('adds the database, migrations and seed services before the application', () => {
      expect(Object.keys(services)).toEqual([
        'postgres',
        'app.migrations',
        'app.seed',
        'app'
      ]);
      expect(services['app.migrations'].depends_on).toEqual({
        postgres: { condition: 'service_healthy' }
      });
      expect(services['app.seed'].command).toEqual(['seed']);
      expect(parse(result).volumes).toEqual({ 'postgres-data': null });
    });

    test('starts the application after the seed, on the database host', () => {
      expect(services.app.depends_on).toEqual({
        'app.seed': { condition: 'service_completed_successfully' }
      });
      expect(services.app.environment).toEqual({ DB_HOST: 'postgres' });
    });

    test('points the new services at an existing Redis service', () => {
      const withRedis = parse(
        addDatabaseServices(addRedisService(appCompose, 'app'), context)
      ).services;

      expect(Object.keys(withRedis)).toEqual([
        'postgres',
        'redis',
        'app.migrations',
        'app.seed',
        'app'
      ]);
      expect(withRedis['app.seed'].environment).toEqual({
        DB_HOST: 'postgres',
        REDIS_HOST: 'redis'
      });
    });

    test('shares the SQLite volume instead of a database service', () => {
      const sqlite = parse(
        addDatabaseServices(appCompose, { ...context, database: 'sqlite' })
      );

      expect(Object.keys(sqlite.services)).toEqual([
        'app.migrations',
        'app.seed',
        'app'
      ]);
      expect(sqlite.services.app.volumes).toEqual([
        './storage:/usr/app/storage',
        'sqlite-data:/usr/app/data'
      ]);
      expect(sqlite.services.app).not.toHaveProperty('environment');
      expect(sqlite.volumes).toEqual({ 'sqlite-data': null });
    });

    test('keeps a file that has the database services', () => {
      expect(addDatabaseServices(result, context)).toBe(result);
    });
  });

  describe('removeDatabaseServices', () => {
    test.each(['postgresql', 'sqlite'] as const)(
      'restores the %s file of addDatabaseServices',
      (database) => {
        const project = { ...context, database };
        expect(
          removeDatabaseServices(
            addDatabaseServices(appCompose, project),
            project
          )
        ).toBe(appCompose);
      }
    );
  });

  describe('addServerPort', () => {
    test('publishes the port and checks the readiness of the server', () => {
      const result = addServerPort(appCompose, context);
      const app = parse(result).services.app;

      expect(Object.keys(app)).toEqual([
        'image',
        'build',
        'healthcheck',
        'ports',
        'volumes',
        'env_file',
        'networks'
      ]);
      expect(app.ports).toEqual(['127.0.0.1:5000:5000']);
      expect(app.healthcheck.test).toBe(
        'wget -qO - http://127.0.0.1:5000/health/ready || exit 1'
      );
      expect(addServerPort(result, context)).toBe(result);
    });
  });

  describe('removeServerPort', () => {
    test('restores the file of addServerPort', () => {
      expect(
        removeServerPort(addServerPort(appCompose, context), context)
      ).toBe(appCompose);
    });
  });
});
