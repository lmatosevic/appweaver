import { Application, createApp } from '@appweaver/core';
import { Role } from '@/features/access/roles';
import { resetTestData } from './support/reset';
import {
  account,
  box,
  createRoles,
  db,
  point,
  request,
  vehicle
} from './support/fixtures';

/**
 * The live map of the dispatchers: the vehicles near a place, in a viewport
 * and in a geofence, the trips through a geofence, and the vehicles and
 * trips a driver sees. The positions lie around 17.5° E, 44.5° N, apart from
 * those of the other test files.
 */
describe('Fleet map', () => {
  let app: Application;
  let dispatcher: Record<string, string>;
  let driver: { id: number; auth: Record<string, string> };
  let vehicles: Record<string, { id: number; name: string }>;
  let yardId: number;

  const query = (filter: object, sort?: object | string) =>
    request(app, 'POST', '/vehicles/query', {
      headers: dispatcher,
      payload: { filter, sort, size: 50 }
    });

  const names = (items: { id: number }[]) =>
    items.map(
      (item) =>
        Object.entries(vehicles).find(([, v]) => v.id === item.id)?.[0] ??
        'other'
    );

  beforeAll(async () => {
    app = await createApp();
    await createRoles();

    dispatcher = (await account(app, 'Emma', Role.Dispatcher)).auth;
    driver = await account(app, 'James', Role.Driver);

    // About 800 m, 1.6 km, 2.4 km and 4 km east of 17.5° E, 44.5° N
    const at = (lng: number, data: object = {}) =>
      vehicle({ position: point([lng, 44.5]), ...data });
    vehicles = {
      near: await at(17.51, { driverId: driver.id }),
      middle: await at(17.52),
      busy: await at(17.53),
      far: await at(17.55),
      inMaintenance: await at(17.515, { status: 'Maintenance' }),
      untracked: await vehicle()
    };
    await db().trip.create({
      data: {
        vehicleId: vehicles.busy.id,
        startedAt: new Date(),
        startPosition: point([17.53, 44.5])
      }
    });

    const yard = await db().geofence.create({
      data: {
        name: 'Test yard',
        kind: 'Depot',
        area: box(17.505, 44.49, 17.525, 44.51)
      }
    });
    yardId = yard.id;
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('keeps the readings in a hypertable and the geometries in PostGIS', async () => {
    const tables = await db().$queryRawUnsafe(
      `SELECT hypertable_name FROM timescaledb_information.hypertables`
    );
    const [{ type }] = await db().$queryRawUnsafe(
      `SELECT type FROM geometry_columns WHERE f_table_name = 'Vehicle' AND f_geometry_column = 'positionGeom'`
    );

    expect(tables).toEqual([{ hypertable_name: 'VehicleSeries' }]);
    expect(type).toBe('POINT');
  });

  test('finds the nearest free vehicles to a job, with an arrival estimate', async () => {
    const { status, body } = await request(
      app,
      'GET',
      '/vehicles/nearest?lat=44.5&lng=17.5&radius=3000',
      { headers: dispatcher }
    );

    expect(status).toBe(200);
    expect(names(body.items.map((item: any) => item.vehicle))).toEqual([
      'near',
      'middle'
    ]);
    expect(body.items[0].distanceMeters).toBeCloseTo(793, -1);
    expect(body.items[0].etaMinutes).toBe(3);
    expect(body.items[1].distanceMeters).toBeCloseTo(1586, -1);
  });

  test('queries the vehicles near a point, nearest first, with their distance', async () => {
    const { body } = await query(
      {
        position: {
          _near: { point: [17.56, 44.5], maxDistance: 2500, minDistance: 100 }
        }
      },
      'position'
    );

    expect(names(body.items)).toEqual(['far', 'busy']);
    expect(body.items[0].positionDistance).toBeCloseTo(793, -1);
  });

  test('queries the vehicles of a map viewport', async () => {
    const { body } = await query(
      { position: { _withinBox: [17.505, 44.4, 17.535, 44.6] } },
      'id'
    );

    expect(names(body.items)).toEqual([
      'near',
      'middle',
      'busy',
      'inMaintenance'
    ]);
  });

  test('queries the vehicles without a known position', async () => {
    const { body } = await query({ position: { _exists: false } }, 'id');

    expect(names(body.items)).toContain('untracked');
    expect(names(body.items)).not.toContain('near');
  });

  test('lists the vehicles inside a geofence', async () => {
    const { status, body } = await request(
      app,
      'GET',
      `/geofences/${yardId}/vehicles`,
      { headers: dispatcher }
    );

    expect(status).toBe(200);
    expect(names(body.items).sort()).toEqual([
      'inMaintenance',
      'middle',
      'near'
    ]);
  });

  test('lists the trips whose path crosses a geofence', async () => {
    const trip = (vehicleId: number, coordinates: number[][]) =>
      db().trip.create({
        data: {
          vehicleId,
          status: 'Completed',
          startedAt: new Date('2026-11-01T08:00:00Z'),
          endedAt: new Date('2026-11-01T09:00:00Z'),
          startPosition: point(coordinates[0] as [number, number]),
          path: { type: 'LineString', coordinates }
        }
      });
    // Through the yard, past it, and starting in it without a path yet
    const through = await trip(vehicles.far.id, [
      [17.5, 44.5],
      [17.53, 44.5]
    ]);
    await trip(vehicles.far.id, [
      [17.5, 44.52],
      [17.53, 44.52]
    ]);
    const parked = await db().trip.create({
      data: {
        vehicleId: vehicles.middle.id,
        status: 'Completed',
        startedAt: new Date('2026-11-02T08:00:00Z'),
        startPosition: point([17.51, 44.5])
      }
    });

    const all = await request(app, 'GET', `/geofences/${yardId}/trips`, {
      headers: dispatcher
    });
    const november = await request(
      app,
      'GET',
      `/geofences/${yardId}/trips?from=2026-11-01T00:00:00Z&to=2026-11-02T00:00:00Z`,
      { headers: dispatcher }
    );

    expect(all.status).toBe(200);
    expect(all.body.items.map((item: any) => item.id)).toEqual([
      parked.id,
      through.id
    ]);
    expect(november.body.items.map((item: any) => item.id)).toEqual([
      through.id
    ]);
  });

  test('shows the drivers only their own vehicles and trips', async () => {
    const own = await request(app, 'POST', '/vehicles/query', {
      headers: driver.auth,
      payload: {}
    });
    const other = await request(app, 'GET', `/vehicles/${vehicles.far.id}`, {
      headers: driver.auth
    });
    const series = await request(
      app,
      'GET',
      `/vehicles/${vehicles.far.id}/series`,
      { headers: driver.auth }
    );
    const nearest = await request(
      app,
      'GET',
      '/vehicles/nearest?lat=44.5&lng=17.5',
      { headers: driver.auth }
    );

    expect(names(own.body.items)).toEqual(['near']);
    expect(other.status).toBe(404);
    expect(series.status).toBe(404);
    expect(nearest.status).toBe(403);
  });

  test('assigns a driver and a route, but never the reported state', async () => {
    const route = await db().route.create({
      data: {
        code: 'TEST-YARD',
        name: 'Test yard loop',
        path: {
          type: 'LineString',
          coordinates: [
            [17.5, 44.5],
            [17.51, 44.5]
          ]
        }
      }
    });

    const assigned = await request(
      app,
      'PATCH',
      `/vehicles/${vehicles.middle.id}`,
      {
        headers: dispatcher,
        payload: { driver: driver.id, assignedRoute: route.id }
      }
    );
    const moved = await request(
      app,
      'PATCH',
      `/vehicles/${vehicles.middle.id}`,
      {
        headers: dispatcher,
        payload: { position: { lat: 0, lng: 0 } }
      }
    );
    const lengths = await request(app, 'GET', `/routes/${route.id}`, {
      headers: dispatcher
    });

    expect(assigned.status).toBe(200);
    expect(assigned.body).toMatchObject({
      driver: { id: driver.id },
      assignedRoute: { id: route.id }
    });
    expect(moved.status).toBe(400);
    expect(lengths.body.lengthMeters).toBeCloseTo(793, -1);
  });
});
