const autocannon = require('autocannon');

/**
 * A small HTTP client of the application under load, for the `prepare` step of a sample and the sign-in.
 *
 * @param {string} baseUrl - The URL of the application.
 * @param {object} [headers] - The headers of every request, i.e. the credentials.
 */
function createApi(baseUrl, headers = {}) {
  async function request(method, path, body, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.auth === false ? {} : headers),
        ...options.headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} ${path} answered ${response.status}: ${text.slice(0, 500)}`);
    }
    return text ? JSON.parse(text) : undefined;
  }
  return {
    request,
    get: (path, options) => request('GET', path, undefined, options),
    post: (path, body, options) => request('POST', path, body, options),
    withHeaders: (extra) => createApi(baseUrl, { ...headers, ...extra })
  };
}

/**
 * Runs one scenario with autocannon. The `path` and `body` of a scenario may be functions, called for every request
 * with the context of the sample (the values its `prepare` returned and the random helpers), so no two requests hit
 * the response cache unless the scenario wants it.
 *
 * @return {Promise<object>} The result of the scenario, as written to the report.
 */
async function runScenario({ baseUrl, scenario, context, headers, connections, duration, timeout }) {
  const method = scenario.method ?? 'GET';
  const resolve = (value) => (typeof value === 'function' ? value(context) : value);
  const requestHeaders = {
    ...(scenario.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(scenario.auth ? headers : {}),
    ...scenario.headers
  };

  const result = await autocannon({
    url: baseUrl,
    connections,
    duration,
    timeout,
    requests: [
      {
        method,
        setupRequest: (request) => {
          request.path = resolve(scenario.path);
          request.headers = { ...request.headers, ...requestHeaders };
          if (scenario.body !== undefined) {
            request.body = JSON.stringify(resolve(scenario.body));
          }
          return request;
        }
      }
    ]
  });

  return {
    name: scenario.name,
    description: scenario.description,
    connections,
    duration,
    requests: result.requests.total,
    requestsPerSecond: round(result.requests.average),
    latency: {
      p50: result.latency.p50,
      p97_5: result.latency.p97_5,
      p99: result.latency.p99,
      max: result.latency.max
    },
    throughputBytesPerSecond: Math.round(result.throughput.average),
    errors: result.errors,
    timeouts: result.timeouts,
    non2xx: result.non2xx,
    statusCodes: Object.fromEntries(
      Object.entries(result.statusCodeStats ?? {}).map(([code, stats]) => [code, stats.count])
    )
  };
}

const adminEmail = process.env.LOAD_ADMIN_EMAIL || 'admin@appweaver.co';
const adminPassword = process.env.LOAD_ADMIN_PASSWORD || 'Load-test-password-1';

/**
 * The credentials of the scenarios with `auth`, by the `auth` of the sample: `basic` or `login` (a JWT of
 * `/auth/login`) as the admin the seeders create, an object `{ type, username, password }` for another user, or none.
 */
async function authenticate(sample, baseUrl) {
  const auth = typeof sample.auth === 'string' ? { type: sample.auth } : (sample.auth ?? { type: 'none' });
  const username = auth.username ?? adminEmail;
  const password = auth.password ?? adminPassword;
  if (auth.type === 'basic') {
    return { authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
  }
  if (auth.type === 'login') {
    const tokens = await createApi(baseUrl).post('/auth/login', { username, password });
    return { authorization: `Bearer ${tokens.accessToken}` };
  }
  return {};
}

function round(value) {
  return Math.round(value * 10) / 10;
}

module.exports = { adminEmail, adminPassword, authenticate, createApi, runScenario };
