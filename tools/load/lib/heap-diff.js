const fs = require('fs');

/**
 * Sums the nodes of a heap snapshot by their type and constructor or name (`object Map`, `closure onRequest`, ...).
 *
 * @param {string} file - The `.heapsnapshot` file.
 * @return {Map<string, { count: number, size: number }>} The count and the self size of each group.
 */
function summarizeSnapshot(file) {
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fields = snapshot.snapshot.meta.node_fields;
  const types = snapshot.snapshot.meta.node_types[0];
  const typeIndex = fields.indexOf('type');
  const nameIndex = fields.indexOf('name');
  const sizeIndex = fields.indexOf('self_size');
  const { nodes, strings } = snapshot;
  const groups = new Map();
  for (let i = 0; i < nodes.length; i += fields.length) {
    const type = types[nodes[i + typeIndex]];
    // Strings, numbers and code are grouped by their type alone, their names are their values
    const name = ['object', 'closure', 'native'].includes(type)
      ? `${type} ${strings[nodes[i + nameIndex]].slice(0, 80)}`
      : type;
    const group = groups.get(name) ?? { count: 0, size: 0 };
    group.count += 1;
    group.size += nodes[i + sizeIndex];
    groups.set(name, group);
  }
  return groups;
}

/**
 * The groups of nodes that grew the most between two heap snapshots, by self size.
 *
 * @return {object[]} The `limit` largest growths, and the totals of both snapshots.
 */
function diffSnapshots(beforeFile, afterFile, limit = 25) {
  const before = summarizeSnapshot(beforeFile);
  const after = summarizeSnapshot(afterFile);
  const total = (groups) =>
    [...groups.values()].reduce((sum, group) => ({ count: sum.count + group.count, size: sum.size + group.size }), {
      count: 0,
      size: 0
    });
  const growth = [...new Set([...before.keys(), ...after.keys()])]
    .map((name) => {
      const b = before.get(name) ?? { count: 0, size: 0 };
      const a = after.get(name) ?? { count: 0, size: 0 };
      return { name, countDelta: a.count - b.count, sizeDelta: a.size - b.size, count: a.count, size: a.size };
    })
    .filter((group) => group.sizeDelta > 0)
    .sort((x, y) => y.sizeDelta - x.sizeDelta)
    .slice(0, limit);
  return { before: total(before), after: total(after), growth };
}

module.exports = { summarizeSnapshot, diffSnapshots };
