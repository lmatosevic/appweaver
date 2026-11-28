const fs = require('fs');
const path = require('path');
const scenarioHelpers = require('./scenarios');

const rootDir = path.resolve(__dirname, '..', '..', '..');

/** The load definition of a sample, relative to its directory. */
const definitionPath = path.join('test', 'load', 'load.js');

/** Whether a sample directory has a load definition. */
function hasLoadDefinition(sampleDir) {
  return fs.existsSync(path.join(sampleDir, definitionPath));
}

/**
 * Loads the load definition of a sample (`test/load/load.js` of its directory, a function given the scenario helpers
 * of the harness), with its name, directory and runtime.
 *
 * @param {string} sampleDir - The directory of the sample, by default the working directory.
 */
function loadSample(sampleDir = process.cwd()) {
  const dir = path.resolve(sampleDir);
  const name = path.basename(dir);
  const file = path.join(dir, definitionPath);
  if (!fs.existsSync(file)) {
    throw new Error(`${name} has no load definition (${definitionPath})`);
  }
  const exported = require(file);
  const definition = typeof exported === 'function' ? exported(scenarioHelpers) : exported;
  const runtime = fs.existsSync(path.join(dir, 'bunfig.toml')) ? 'bun' : 'node';
  return {
    name,
    dir,
    runtime,
    scenarios: [],
    ...definition,
    env: { ...exampleEnv(dir), ...definition.env }
  };
}

/**
 * The values of the `.env.example` of a sample without a `.env`, i.e. the database password its Docker Compose file
 * and its configuration read, given to the processes the harness starts instead of a `.env` written for them. The empty
 * values are left out, so they never override the configuration (an empty `SECURITY_RECAPTCHA_SECRET`), and so is
 * `NODE_ENV`, which the harness sets. A sample with a `.env` reads its own.
 *
 * @param {string} dir - The directory of the sample.
 * @return {Record<string, string>} The variables.
 */
function exampleEnv(dir) {
  const exampleFile = path.join(dir, '.env.example');
  if (fs.existsSync(path.join(dir, '.env')) || !fs.existsSync(exampleFile)) {
    return {};
  }
  const env = {};
  for (const line of fs.readFileSync(exampleFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    const value = match?.[2].replace(/^(['"])(.*)\1$/, '$2');
    if (match && value && match[1] !== 'NODE_ENV') {
      env[match[1]] = value;
    }
  }
  return env;
}

/** The size argument (`10k`, `100k`, `1m` or a number) as a number of rows. */
function parseSize(value) {
  const match = /^(\d+(?:\.\d+)?)([km]?)$/i.exec(String(value).trim());
  if (!match) {
    throw new Error(`Invalid size ${value}, expected i.e. 10k, 100k, 1m or 5000`);
  }
  const factor = { '': 1, k: 1_000, m: 1_000_000 }[match[2].toLowerCase()];
  return Math.round(Number(match[1]) * factor);
}

/** The size as a label, `100000` as `100k`. */
function sizeLabel(count) {
  if (count >= 1_000_000 && count % 1_000_000 === 0) {
    return `${count / 1_000_000}m`;
  }
  if (count >= 1_000 && count % 1_000 === 0) {
    return `${count / 1_000}k`;
  }
  return String(count);
}

module.exports = { rootDir, hasLoadDefinition, loadSample, parseSize, sizeLabel };
