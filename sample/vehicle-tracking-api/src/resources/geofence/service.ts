import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Geofence',
  textSearch: {
    name: {
      contains: '{input}',
      mode: 'insensitive'
    }
  }
});
