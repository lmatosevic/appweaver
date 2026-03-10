import { createModel } from '../../../factory';

export default createModel({
  name: 'Seeder',
  tableName: '_seeders',
  generateTypes: false,
  id: {
    type: 'string',
    generator: 'uuid()'
  },
  audit: {
    updatedAt: false,
    createdAt: false,
    createdById: false
  },
  scalars: {
    checksum: {
      type: 'string',
      maxLength: 255
    },
    seederName: {
      type: 'string',
      unique: true,
      maxLength: 511
    },
    startedAt: {
      type: 'dateTime'
    },
    finishedAt: {
      type: 'dateTime'
    },
    logs: {
      type: 'string',
      required: false
    }
  }
});
