import { Document, Pair, parseDocument, Scalar, YAMLMap } from 'yaml';

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
  const position = index < 0 ? services.items.length : index;
  const service = parsePair(`redis:
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
`);
  setSpaceBefore(service, position > 0);
  services.items.splice(position, 0, service);
  if (services.items[position + 1]) {
    setSpaceBefore(services.items[position + 1], true);
  }

  for (const serviceName of getServiceNames(name)) {
    const app = services.get(serviceName);
    if (!(app instanceof YAMLMap)) {
      continue;
    }

    let environment = app.get('environment');
    if (!(environment instanceof YAMLMap)) {
      environment = new YAMLMap();
      const envFile = app.items.findIndex((pair) => keyOf(pair) === 'env_file');
      app.items.splice(
        envFile < 0 ? app.items.length : envFile + 1,
        0,
        new Pair(new Scalar('environment'), environment)
      );
    }
    const host = new Scalar('redis');
    host.type = Scalar.QUOTE_DOUBLE;
    (environment as YAMLMap).set('REDIS_HOST', host);
  }

  const dependsOn = services.getIn([name, 'depends_on']);
  if (dependsOn instanceof YAMLMap) {
    dependsOn.items.unshift(
      parsePair('redis:\n  condition: service_healthy\n')
    );
  }

  let volumes = getMap(doc, 'volumes');
  if (!volumes) {
    volumes = new YAMLMap();
    doc.set('volumes', volumes);
  }
  volumes.items.push(parsePair('redis-data:\n'));

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

  const index = services.items.findIndex((pair) => keyOf(pair) === 'redis');
  if (index >= 0) {
    services.items.splice(index, 1);
    if (index === 0 && services.items[0]) {
      setSpaceBefore(services.items[0], false);
    }
  }

  for (const serviceName of getServiceNames(name)) {
    const app = services.get(serviceName);
    if (!(app instanceof YAMLMap)) {
      continue;
    }

    const environment = app.get('environment');
    if (environment instanceof YAMLMap) {
      environment.delete('REDIS_HOST');
      if (environment.items.length === 0) {
        app.delete('environment');
      }
    }

    const dependsOn = app.get('depends_on');
    if (dependsOn instanceof YAMLMap) {
      dependsOn.delete('redis');
    }
  }

  getMap(doc, 'volumes')?.delete('redis-data');

  return doc.toString({ lineWidth: 0 });
}

/** The names of the services running the application image. */
function getServiceNames(name: string): string[] {
  return [`${name}.migrations`, `${name}.seed`, name];
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

/** Sets whether an empty line separates the map entry from the previous one. */
function setSpaceBefore(pair: Pair, space: boolean): void {
  if (pair.key instanceof Scalar) {
    pair.key.spaceBefore = space;
  }
}
