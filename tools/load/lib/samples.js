const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const samplesDir = path.join(rootDir, 'sample');
const definitionsDir = path.join(__dirname, '..', 'samples');

/** The names of the samples with a load definition, in `tools/load/samples`. */
function sampleNames() {
  return fs
    .readdirSync(definitionsDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => file.replace(/\.js$/, ''))
    .sort();
}

/**
 * Loads the load definition of a sample, with its directory and runtime.
 *
 * @param {string} name - The directory name of the sample, i.e. `cms-api`.
 */
function loadSample(name) {
  const file = path.join(definitionsDir, `${name}.js`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `No load definition for ${name}, the samples with one: ${sampleNames().join(', ')}`
    );
  }
  const definition = require(file);
  const dir = path.join(samplesDir, name);
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

module.exports = { rootDir, samplesDir, sampleNames, loadSample, parseSize, sizeLabel };
