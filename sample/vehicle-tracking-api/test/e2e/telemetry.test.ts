import { Application, createApp } from '@appweaver/core';
import { Role } from '@/features/access/roles';
import { endSilentTrips } from '@/features/trips/end-silent-trips';
import { resetTestData } from './support/reset';
import {
  account,
  at,
  box,
  createRoles,
  db,
  gateway,
  point,
  request,
  vehicle
} from './support/fixtures';

/**
 * The pings of the trackers: the trips they start, extend and end, the alerts
 * they raise against the geofences and the route, and the readings recorded
 * in the time series.
 */
describe('Telemetry', () => {
  let app: Application;
  let tracker: Record<string, string>;
  let admin: Record<string, string>;
  let dispatcher: Record<string, string>;
  let routeId: number;
  let zones: Record<'depot' | 'restricted' | 'school', number>;

  // Along the 45.005 parallel, from the depot through the school zone
  const ROUTE: [number, number][] = [
    [16.005, 45.005],
    [16.12, 45.005]
  ];

  const report = (pings: object[]) =>
    request(app, 'POST', '/telemetry', {
      headers: tracker,
      payload: { pings }
    });

  const alertsOf = async (vehicleId: number) =>
    (
      await request(app, 'POST', '/alerts/query', {
        headers: dispatcher,
        payload: {
          filter: { vehicle: { id: vehicleId } },
          sort: { occurredAt: 'asc', id: 'asc' },
          size: 100
        }
      })
    ).body.items;

  const tripOf = async (vehicleId: number) =>
    db().trip.findFirst({
      where: { vehicleId },
      orderBy: { startedAt: 'desc' }
    });

  beforeAll(async () => {
    app = await createApp();
    await createRoles();

    tracker = await gateway();
    admin = (await account(app, 'Iva', Role.Admin)).auth;
    dispatcher = (await account(app, 'Petra', Role.Dispatcher)).auth;

    const depot = await db().geofence.create({
      data: {
        name: 'Test depot',
        kind: 'Depot',
        area: box(16.0, 45.0, 16.01, 45.01)
      }
    });
    const restricted = await db().geofence.create({
      data: {
        name: 'Test pedestrian zone',
        kind: 'Restricted',
        area: box(16.02, 45.02, 16.04, 45.03)
      }
    });
    const school = await db().geofence.create({
      data: {
        name: 'Test school zone',
        kind: 'SpeedZone',
        speedLimit: 30,
        area: box(16.1, 45.0, 16.11, 45.01)
      }
    });
    zones = { depot: depot.id, restricted: restricted.id, school: school.id };

    const route = await db().route.create({
      data: {
        code: 'TEST-EAST',
        name: 'Test route east',
        corridorMeters: 200,
        path: { type: 'LineString', coordinates: ROUTE },
        stops: {
          create: [
            {
              name: 'Halfway',
              sequence: 1,
              radiusMeters: 50,
              location: point([16.08, 45.005])
            },
            {
              name: 'End',
              sequence: 2,
              radiusMeters: 50,
              location: point([16.12, 45.005])
            }
          ]
        }
      }
    });
    routeId = route.id;
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('drives a trip along its route, from the ignition on to off', async () => {
    const van = await vehicle({ assignedRouteId: routeId });
    const start = Date.now() - 300_000;
    const ping = (seconds: number, lng: number, speed: number) => ({
      deviceId: van.deviceId,
      time: at(start, seconds),
      position: [lng, 45.005],
      speed,
      ignition: true,
      fuelLevel: 50 - seconds / 60,
      engineTemp: 60 + seconds / 30
    });

    const { status, body } = await report([
      ping(0, 16.005, 0),
      ping(60, 16.03, 60),
      ping(120, 16.08, 50),
      // In the school zone, at 55 km/h for 30
      ping(180, 16.105, 55),
      { ...ping(240, 16.12, 0), ignition: false }
    ]);

    expect(status).toBe(200);
    expect(body).toEqual({ accepted: 5, stale: 0, rejected: [], alerts: 7 });

    const trip = await tripOf(van.id);
    expect(trip).toMatchObject({
      status: 'Completed',
      endReason: 'IgnitionOff',
      routeId,
      maxSpeed: 60,
      pings: 5,
      offRoute: false,
      startPosition: point([16.005, 45.005]),
      endPosition: point([16.12, 45.005])
    });
    expect(trip.path.coordinates).toHaveLength(5);
    // 0.115 degrees of longitude at 45° N
    expect(trip.distanceMeters).toBeCloseTo(9_041, -2);
    // 4 % of an 80 l tank
    expect(trip.fuelUsed).toBeCloseTo(3.2);
    expect(trip.visitedStopIds).toHaveLength(2);

    const alerts = await alertsOf(van.id);
    expect(
      alerts.map((alert: any) => [alert.type, alert.severity, alert.open])
    ).toEqual([
      ['GeofenceEnter', 'Info', false],
      ['GeofenceExit', 'Info', false],
      ['StopArrival', 'Info', false],
      ['GeofenceEnter', 'Info', false],
      ['Speeding', 'Warning', true],
      ['GeofenceExit', 'Info', false],
      ['StopArrival', 'Info', false]
    ]);
    // The single route includes the geofence
    const speeding = await request(app, 'GET', `/alerts/${alerts[4].id}`, {
      headers: dispatcher
    });
    expect(speeding.body).toMatchObject({
      value: 55,
      message: `${van.name} drove 55 km/h in Test school zone (limit 30 km/h)`,
      geofence: { id: zones.school },
      position: point([16.105, 45.005])
    });

    const state = await request(app, 'GET', `/vehicles/${van.id}`, {
      headers: dispatcher
    });
    expect(state.body).toMatchObject({
      position: point([16.12, 45.005]),
      speed: 0,
      ignition: false,
      fuelLevel: 46,
      heading: 90,
      lastSeenAt: at(start, 240),
      online: true
    });
  });

  test('raises an alert once when leaving the route and entering a restricted zone', async () => {
    const van = await vehicle({ assignedRouteId: routeId });
    const start = Date.now() - 600_000;
    const ping = (seconds: number, position: number[], fuelLevel: number) => ({
      deviceId: van.deviceId,
      time: at(start, seconds),
      position,
      speed: 40,
      ignition: true,
      fuelLevel
    });

    const { body } = await report([
      ping(0, [16.015, 45.005], 17),
      ping(60, [16.03, 45.025], 16),
      ping(120, [16.035, 45.026], 14),
      ping(180, [16.05, 45.005], 13)
    ]);

    expect(body.alerts).toBe(4);
    expect(
      (await alertsOf(van.id)).map((alert: any) => [alert.type, alert.severity])
    ).toEqual([
      ['RestrictedZone', 'Critical'],
      ['OffRoute', 'Warning'],
      ['LowFuel', 'Warning'],
      ['GeofenceExit', 'Info']
    ]);

    // Back on the route, so a later departure raises a new alert
    const trip = await tripOf(van.id);
    expect(trip).toMatchObject({ status: 'Active', offRoute: false });
  });

  test('keeps a ping older than the last one in the history only', async () => {
    const car = await vehicle();
    const start = Date.now() - 600_000;
    const ping = (seconds: number, lng: number) => ({
      deviceId: car.deviceId,
      time: at(start, seconds),
      position: { lat: 45.5, lng },
      speed: 30,
      ignition: false
    });

    await report([ping(60, 16.5)]);
    const late = await report([ping(30, 16.4)]);

    expect(late.body).toMatchObject({ accepted: 0, stale: 1 });
    const state = await db().vehicle.findUnique({ where: { id: car.id } });
    expect(state.position).toEqual(point([16.5, 45.5]));

    const series = await request(
      app,
      'GET',
      `/vehicles/${car.id}/series?fields=speed`,
      { headers: dispatcher }
    );
    expect(series.body.items).toEqual([
      { time: at(start, 30), speed: 30 },
      { time: at(start, 60), speed: 30 }
    ]);
  });

  test('rejects the pings of an unknown or retired tracker', async () => {
    const retired = await vehicle({ status: 'Retired' });

    const { status, body } = await report([
      {
        deviceId: '000000000000001',
        position: [16, 45],
        speed: 0,
        ignition: false
      },
      {
        deviceId: retired.deviceId,
        position: [16, 45],
        speed: 0,
        ignition: false
      }
    ]);

    expect(status).toBe(200);
    expect(body).toEqual({
      accepted: 0,
      stale: 0,
      rejected: [
        {
          index: 0,
          deviceId: '000000000000001',
          reason: 'Unknown or retired tracker'
        },
        {
          index: 1,
          deviceId: retired.deviceId,
          reason: 'Unknown or retired tracker'
        }
      ],
      alerts: 0
    });
  });

  test('takes the pings of the tracker and the admins only', async () => {
    const payload = {
      pings: [
        {
          deviceId: '000000000000002',
          position: [16, 45],
          speed: 0,
          ignition: false
        }
      ]
    };

    const asDispatcher = await request(app, 'POST', '/telemetry', {
      headers: dispatcher,
      payload
    });
    const asAdmin = await request(app, 'POST', '/telemetry', {
      headers: admin,
      payload
    });
    const anonymous = await request(app, 'POST', '/telemetry', { payload });
    const invalid = await report([
      { deviceId: '123', position: [200, 45], speed: -1, ignition: true }
    ]);

    expect(asDispatcher.status).toBe(403);
    expect(asAdmin.status).toBe(200);
    expect(anonymous.status).toBe(401);
    expect(invalid.status).toBe(400);
  });

  test('summarizes a trip from its readings', async () => {
    const truck = await vehicle({ fuelCapacity: 300 });
    const start = Date.now() - 3_600_000;
    const ping = (minutes: number, lng: number, speed: number) => ({
      deviceId: truck.deviceId,
      time: at(start, minutes * 60),
      position: [lng, 45.5],
      speed,
      ignition: minutes < 30,
      fuelLevel: 80 - minutes / 10,
      engineTemp: 70 + minutes,
      batteryVoltage: 14 - minutes / 100
    });

    await report([
      ping(0, 16.2, 0),
      ping(10, 16.3, 70),
      ping(20, 16.4, 90),
      ping(30, 16.45, 0)
    ]);
    const trip = await tripOf(truck.id);

    const { status, body } = await request(
      app,
      'GET',
      `/trips/${trip.id}/summary?bucket=10m`,
      { headers: dispatcher }
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      tripId: trip.id,
      vehicleId: truck.id,
      status: 'Completed',
      durationSeconds: 1800,
      vertices: 4,
      maxSpeed: 90,
      // 3 % of a 300 l tank
      fuelUsed: 9,
      engineTemp: { avg: 85, max: 100 },
      minBatteryVoltage: 13.7,
      fuelLevel: { start: 80, end: 77 }
    });
    expect(body.distanceKm).toBeCloseTo(19.5, 0);
    expect(body.averageSpeed).toBeCloseTo(body.distanceKm * 2, 0);
    expect(body.speedProfile.map((bucket: any) => bucket.max)).toEqual(
      expect.arrayContaining([70, 90])
    );
  });

  test('ends a trip whose tracker went silent', async () => {
    const van = await vehicle();
    const lastPing = Date.now() - 45 * 60_000;
    await report([
      {
        deviceId: van.deviceId,
        time: new Date(lastPing).toISOString(),
        position: [16.6, 45.6],
        speed: 50,
        ignition: true
      }
    ]);

    await expect(endSilentTrips()).resolves.toBeGreaterThanOrEqual(1);

    expect(await tripOf(van.id)).toMatchObject({
      status: 'Completed',
      endReason: 'SignalLost',
      endedAt: new Date(lastPing),
      endPosition: point([16.6, 45.6])
    });
    expect((await alertsOf(van.id)).map((alert: any) => alert.type)).toEqual([
      'SignalLost'
    ]);
  });

  test('closes an alert once acknowledged by a dispatcher', async () => {
    const van = await vehicle({ speedLimit: 50 });
    await report([
      {
        deviceId: van.deviceId,
        position: [16.7, 45.7],
        speed: 80,
        ignition: true
      }
    ]);
    const [speeding] = await alertsOf(van.id);

    const acknowledged = await request(
      app,
      'POST',
      `/alerts/${speeding.id}/acknowledge`,
      { headers: dispatcher }
    );
    const again = await request(
      app,
      'POST',
      `/alerts/${speeding.id}/acknowledge`,
      { headers: dispatcher }
    );

    expect(acknowledged.status).toBe(200);
    expect(acknowledged.body).toMatchObject({
      type: 'Speeding',
      open: false,
      acknowledgedBy: { id: expect.any(Number) }
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALERT_ALREADY_ACKNOWLEDGED');
  });
});
