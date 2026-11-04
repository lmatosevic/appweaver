import { Document, Pair, parseDocument, Scalar, YAMLMap, YAMLSeq } from 'yaml';
import { getDatabaseDockerService } from './database-config';
import type { ProjectContext } from './types';

const sqliteVolume = 'sqlite-data:/usr/app/data';

/**
 * Adds the Redis service to a docker-compose.yml file: the service itself, the application's dependency on it, the
 * `REDIS_HOST` of the application services, and the named volume of its data. The rest of the file keeps its
 * formatting and comments.
 *
 * @param {string} content - The docker-compose.yml content.
 * @param {string} name - The project name, naming the containers and the network.
 * @return {string} The docker-compose.yml content with the Redis service.
 */
export function addRedisService(content: string, name: string): string {
  const doc = parseDocument(content);
  const services = getMap(doc, 'services');
  if (!services || services.has('redis')) {
    return content;
  }

  // Before the application services, after the database one
  const index = services.items.findIndex((pair) =>
    getServiceNames(name).includes(keyOf(pair) as string)
  );
  insertService(
    services,
    index < 0 ? services.items.length : index,
    parsePair(`redis:
  image: redis:7.4.9
  container_name: ${name}-redis
  restart: unless-stopped
  healthcheck:
    test: [ "CMD", "redis-cli", "ping" ]
    interval: 30s
    timeout: 10s
    retries: 10
    start_period: 5s
    start_interval: 5s
  ports:
    - "127.0.0.1:6379:6379"
  volumes:
    - redis-data:/data
  networks:
    - ${name}
`)
  );

  for (const app of getApplicationServices(services, name)) {
    setEnvironment(app, 'REDIS_HOST', 'redis', false);
  }

  const app = services.get(name);
  if (app instanceof YAMLMap) {
    addDependency(app, 'redis', 'service_healthy', true);
  }

  addVolume(doc, 'redis-data', false);

  return doc.toString({ lineWidth: 0 });
}

/**
 * Removes the Redis service of {@link addRedisService} from a docker-compose.yml file.
 *
 * @param {string} content - The docker-compose.yml content.
 * @param {string} name - The project name, naming the containers and the network.
 * @return {string} The docker-compose.yml content without the Redis service.
 */
export function removeRedisService(content: string, name: string): string {
  const doc = parseDocument(content);
  const services = getMap(doc, 'services');
  if (!services) {
    return content;
  }

  removeService(services, 'redis');
  for (const app of getApplicationServices(services, name)) {
    deleteEnvironment(app, 'REDIS_HOST');
    removeDependency(app, 'redis');
  }
  removeVolume(doc, 'redis-data');

  return doc.toString({ lineWidth: 0 });
}

/**
 * Adds the database services to a docker-compose.yml file: the database server (none for SQLite), the services
 * applying the migrations and seeding the database before the application starts, the `DB_HOST` of the
 * application services (the SQLite volume instead), and the named volume of the database.
 *
 * @param {string} content - The docker-compose.yml content.
 * @param {ProjectContext} context - The project, naming the containers and choosing the database.
 * @return {string} The docker-compose.yml content with the database services.
 */
export function addDatabaseServices(
  content: string,
  context: ProjectContext
): string {
  const { name, database } = context;
  const doc = parseDocument(content);
  const services = getMap(doc, 'services');
  if (!services || services.has(`${name}.migrations`)) {
    return content;
  }

  const db = getDatabaseDockerService(database, name);
  if (db) {
    insertService(services, 0, parsePair(db.service));
  }

  // Rendered with the environment of the other application services
  const environment = [
    ...(db ? [`DB_HOST: "${db.host}"`] : []),
    ...(services.has('redis') ? ['REDIS_HOST: "redis"'] : [])
  ];
  const service = (role: string, dependency: string) =>
    parsePair(`${name}.${role}:
  image: ${name}:latest
  container_name: ${name}-${role}
  restart: no
  build:
    context: .
${dependency ? `  depends_on:\n    ${dependency}\n` : ''}  env_file:
    - .env
${environment.length > 0 ? `  environment:\n${environment.map((line) => `    ${line}\n`).join('')}` : ''}  command: [ "${role}" ]
  volumes:
    - ./storage:/usr/app/storage
    - ./logs:/usr/app/logs
${db ? '' : `    - ${sqliteVolume}\n`}  networks:
    - ${name}
`);

  const index = services.items.findIndex((pair) => keyOf(pair) === name);
  const position = index < 0 ? services.items.length : index;
  insertService(
    services,
    position,
    service(
      'migrations',
      db ? `${db.host}:\n      condition: service_healthy` : ''
    )
  );
  insertService(
    services,
    position + 1,
    service(
      'seed',
      `${name}.migrations:\n      condition: service_completed_successfully`
    )
  );

  const app = services.get(name);
  if (app instanceof YAMLMap) {
    addDependency(app, `${name}.seed`, 'service_completed_successfully');
    if (db) {
      setEnvironment(app, 'DB_HOST', db.host, true);
    } else {
      const volumes = app.get('volumes');
      if (volumes instanceof YAMLSeq) {
        volumes.add(sqliteVolume);
      }
    }
  }

  addVolume(doc, db?.volume ?? 'sqlite-data', true);

  return doc.toString({ lineWidth: 0 });
}

/**
 * Removes the database services of {@link addDatabaseServices} from a docker-compose.yml file.
 *
 * @param {string} content - The docker-compose.yml content.
 * @param {ProjectContext} context - The project, naming the containers and choosing the database.
 * @return {string} The docker-compose.yml content without the database services.
 */
export function removeDatabaseServices(
  content: string,
  context: ProjectContext
): string {
  const { name, database } = context;
  const doc = parseDocument(content);
  const services = getMap(doc, 'services');
  if (!services) {
    return content;
  }

  const db = getDatabaseDockerService(database, name);
  for (const service of [db?.host, `${name}.migrations`, `${name}.seed`]) {
    if (service) {
      removeService(services, service);
    }
  }

  const app = services.get(name);
  if (app instanceof YAMLMap) {
    removeDependency(app, `${name}.seed`);
    deleteEnvironment(app, 'DB_HOST');
    const volumes = app.get('volumes');
    if (volumes instanceof YAMLSeq) {
      const index = volumes.items.findIndex(
        (item) => valueOf(item) === sqliteVolume
      );
      if (index >= 0) {
        volumes.items.splice(index, 1);
      }
    }
  }

  removeVolume(doc, db?.volume ?? 'sqlite-data');

  return doc.toString({ lineWidth: 0 });
}

/**
 * Publishes the port of the server on the application service of a docker-compose.yml file, with the health check
 * of its readiness route.
 *
 * @param {string} content - The docker-compose.yml content.
 * @param {ProjectContext} context - The project, naming the application service and the port of its server.
 * @return {string} The docker-compose.yml content with the server port.
 */
export function addServerPort(
  content: string,
  context: ProjectContext
): string {
  const { name, port } = context;
  const doc = parseDocument(content);
  const app = getMap(doc, 'services')?.get(name);
  if (!(app instanceof YAMLMap) || app.has('ports')) {
    return content;
  }

  const { items } = parseDocument(`healthcheck:
  test: "wget -qO - http://127.0.0.1:${port}/health/ready || exit 1"
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 5s
  start_interval: 5s
ports:
  - "127.0.0.1:${port}:${port}"
`).contents as YAMLMap;
  app.items.splice(indexAfter(app, ['build']), 0, items[0]);
  const volumes = app.items.findIndex((pair) => keyOf(pair) === 'volumes');
  app.items.splice(volumes < 0 ? app.items.length : volumes, 0, items[1]);

  return doc.toString({ lineWidth: 0 });
}

/**
 * Removes the server port of {@link addServerPort} from a docker-compose.yml file.
 *
 * @param {string} content - The docker-compose.yml content.
 * @param {ProjectContext} context - The project, naming the application service.
 * @return {string} The docker-compose.yml content without the server port.
 */
export function removeServerPort(
  content: string,
  context: ProjectContext
): string {
  const doc = parseDocument(content);
  const app = getMap(doc, 'services')?.get(context.name);
  if (!(app instanceof YAMLMap)) {
    return content;
  }

  app.delete('healthcheck');
  app.delete('ports');

  return doc.toString({ lineWidth: 0 });
}

/** The names of the services running the application image. */
function getServiceNames(name: string): string[] {
  return [`${name}.migrations`, `${name}.seed`, name];
}

function getApplicationServices(services: YAMLMap, name: string): YAMLMap[] {
  return getServiceNames(name)
    .map((service) => services.get(service))
    .filter((service): service is YAMLMap => service instanceof YAMLMap);
}

/** Inserts a service, separated from the others by an empty line. */
function insertService(
  services: YAMLMap,
  position: number,
  service: Pair
): void {
  setSpaceBefore(service, position > 0);
  services.items.splice(position, 0, service);
  if (services.items[position + 1]) {
    setSpaceBefore(services.items[position + 1], true);
  }
}

function removeService(services: YAMLMap, name: string): void {
  const index = services.items.findIndex((pair) => keyOf(pair) === name);
  if (index < 0) {
    return;
  }
  services.items.splice(index, 1);
  if (index === 0 && services.items[0]) {
    setSpaceBefore(services.items[0], false);
  }
}

/** Sets a variable of the service's environment, created after its `env_file`. */
function setEnvironment(
  service: YAMLMap,
  key: string,
  value: string,
  first: boolean
): void {
  let environment = service.get('environment');
  if (!(environment instanceof YAMLMap)) {
    environment = new YAMLMap();
    service.items.splice(
      indexAfter(service, ['env_file']),
      0,
      new Pair(new Scalar('environment'), environment)
    );
  }

  const scalar = new Scalar(value);
  scalar.type = Scalar.QUOTE_DOUBLE;
  const map = environment as YAMLMap;
  if (first && !map.has(key)) {
    map.items.unshift(new Pair(new Scalar(key), scalar));
  } else {
    map.set(key, scalar);
  }
}

function deleteEnvironment(service: YAMLMap, key: string): void {
  const environment = service.get('environment');
  if (environment instanceof YAMLMap) {
    environment.delete(key);
    if (environment.items.length === 0) {
      service.delete('environment');
    }
  }
}

/** Adds a dependency of the service, its `depends_on` created after its health check or build. */
function addDependency(
  service: YAMLMap,
  name: string,
  condition: string,
  first = false
): void {
  let dependsOn = service.get('depends_on');
  if (!(dependsOn instanceof YAMLMap)) {
    dependsOn = new YAMLMap();
    service.items.splice(
      indexAfter(service, ['healthcheck', 'build']),
      0,
      new Pair(new Scalar('depends_on'), dependsOn)
    );
  }

  const dependency = parsePair(`${name}:\n  condition: ${condition}\n`);
  if (first) {
    (dependsOn as YAMLMap).items.unshift(dependency);
  } else {
    (dependsOn as YAMLMap).items.push(dependency);
  }
}

function removeDependency(service: YAMLMap, name: string): void {
  const dependsOn = service.get('depends_on');
  if (dependsOn instanceof YAMLMap) {
    dependsOn.delete(name);
    if (dependsOn.items.length === 0) {
      service.delete('depends_on');
    }
  }
}

/** Adds a named volume, creating the top-level `volumes` after the other entries. */
function addVolume(doc: Document, name: string, first: boolean): void {
  let volumes = getMap(doc, 'volumes');
  if (!volumes) {
    volumes = new YAMLMap();
    const pair = new Pair(new Scalar('volumes'), volumes);
    setSpaceBefore(pair, true);
    (doc.contents as YAMLMap).items.push(pair);
  }

  const volume = parsePair(`${name}:\n`);
  if (first) {
    volumes.items.unshift(volume);
  } else {
    volumes.items.push(volume);
  }
}

/** Removes a named volume, with the top-level `volumes` it leaves empty. */
function removeVolume(doc: Document, name: string): void {
  const volumes = getMap(doc, 'volumes');
  volumes?.delete(name);
  if (volumes?.items.length === 0) {
    doc.delete('volumes');
  }
}

/** The position after the first of the keys the map has, or its end. */
function indexAfter(map: YAMLMap, keys: string[]): number {
  const index = keys
    .map((key) => map.items.findIndex((pair) => keyOf(pair) === key))
    .find((position) => position >= 0);
  return index === undefined ? map.items.length : index + 1;
}

function getMap(doc: Document, key: string): YAMLMap | undefined {
  const value = doc.get(key);
  return value instanceof YAMLMap ? value : undefined;
}

function parsePair(yaml: string): Pair {
  return (parseDocument(yaml).contents as YAMLMap).items[0];
}

function keyOf(pair: Pair): unknown {
  return pair.key instanceof Scalar ? pair.key.value : pair.key;
}

function valueOf(item: unknown): unknown {
  return item instanceof Scalar ? item.value : item;
}

/** Sets whether an empty line separates the map entry from the previous one. */
function setSpaceBefore(pair: Pair, space: boolean): void {
  if (pair.key instanceof Scalar) {
    pair.key.spaceBefore = space;
  }
}
