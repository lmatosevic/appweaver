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
  return { name, dir, runtime, scenarios: [], env: {}, ...definition };
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
