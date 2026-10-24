const { defineModule } = require('@appweaver/common');

module.exports = defineModule({ name: 'billing', requires: ['acme-gcs'] });
