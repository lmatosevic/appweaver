const { createTask } = require('@appweaver/core');

module.exports = createTask({
  name: 'billing:sync',
  description: 'Syncs the invoices.',
  run: () => 0
});
