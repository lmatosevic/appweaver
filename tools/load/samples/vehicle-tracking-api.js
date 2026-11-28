// The alerts of the fleet on PostgreSQL with PostGIS and TimescaleDB, read by the admin: the spatial filters of the
// `postgis` engine beside the plain ones.
const { resourceScenarios, collectIds } = require('../lib/scenarios');

// Around Zagreb, where the fleet of the seeders drives
const area = { minLng: 15.8, minLat: 45.7, maxLng: 16.15, maxLat: 45.9 };

module.exports = {
  database: 'postgresql',
  services: ['postgres'],
  port: 5008,
  auth: 'login',
  // The PostgreSQL of the compose file is published on 5433, beside a local one
  env: { RATE_LIMIT_ENABLED: 'false', DB_PORT: '5433' },

  seed: {
    model: 'alert',
    prepare: async ({ ids }) => ({ vehicles: await ids('vehicle') }),
    row: ({ refs, random }) => {
      const occurredAt = random.date(365);
      const lng = area.minLng + random.next() * (area.maxLng - area.minLng);
      const lat = area.minLat + random.next() * (area.maxLat - area.minLat);
      return {
        type: random.pick(['GeofenceEnter', 'GeofenceExit', 'RestrictedZone', 'Speeding', 'OffRoute']),
        severity: random.pick(['Info', 'Info', 'Warning', 'Critical']),
        message: random.sentence(8),
        value: random.int(0, 160),
        occurredAt,
        acknowledgedAt: random.bool(0.7) ? new Date(occurredAt.getTime() + 600_000) : null,
        vehicleId: random.pick(refs.vehicles),
        // The geometry column is written by the trigger of the postgis engine from these
        position: { type: 'Point', coordinates: [lng, lat] },
        positionMinLng: lng,
        positionMinLat: lat,
        positionMaxLng: lng,
        positionMaxLat: lat,
        createdAt: occurredAt,
        updatedAt: occurredAt
      };
    }
  },

  prepare: async (api) => ({ alerts: await collectIds(api, '/api/alerts') }),

  scenarios: [
    ...resourceScenarios({
      path: '/api/alerts',
      bust: 'message',
      auth: true,
      findId: (c) => c.random.pick(c.alerts),
      filterSort: (c) => ({
        filter: { severity: 'Critical', acknowledgedAt: null },
        sort: ['-occurredAt']
      }),
      filterSortDescription: '`query`, unacknowledged `Critical`, `-occurredAt`',
      aggregate: { select: { value: { avg: true, max: true } }, dateField: 'occurredAt' }
    }),
    {
      name: 'query-near',
      description: '`query`, `position: { _near }` 2 km',
      method: 'POST',
      path: '/api/alerts/query',
      auth: true,
      body: (c) => ({
        filter: {
          position: {
            _near: {
              point: [
                area.minLng + c.random.next() * (area.maxLng - area.minLng),
                area.minLat + c.random.next() * (area.maxLat - area.minLat)
              ],
              maxDistance: 2_000
            }
          },
          message: { _ne: c.random.token() }
        },
        totalCount: false
      })
    },
    {
      name: 'query-within-box',
      description: '`query`, `position: { _withinBox }` of about 4 km',
      method: 'POST',
      path: '/api/alerts/query',
      auth: true,
      body: (c) => {
        const lng = area.minLng + c.random.next() * (area.maxLng - area.minLng - 0.05);
        const lat = area.minLat + c.random.next() * (area.maxLat - area.minLat - 0.04);
        return {
          filter: { position: { _withinBox: [lng, lat, lng + 0.05, lat + 0.04] }, message: { _ne: c.random.token() } },
          totalCount: false
        };
      }
    }
  ]
};
