const { createTask } = require('@appweaver/core');

module.exports = createTask({
  description: 'Builds the daily reports.',
  run: ({ argv }) => argv.length
});
