import { GeoPosition } from '@appweaver/common';
import { db } from '@db/client';

/** A closed polygon ring of a box `[minLng, minLat, maxLng, maxLat]`. */
const box = (
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat]
    ] as GeoPosition[]
  ]
});

const point = (lng: number, lat: number) => ({
  type: 'Point' as const,
  coordinates: [lng, lat] as GeoPosition
});

// Around Zagreb, the positions [lng, lat] in WGS 84
const geofences = [
  {
    name: 'Jankomir depot',
    kind: 'Depot' as const,
    area: box(15.876, 45.792, 15.884, 45.798),
    description: 'Where the vehicles park overnight and refuel'
  },
  {
    name: 'Dolac market',
    kind: 'Customer' as const,
    area: box(15.9755, 45.8125, 15.9795, 45.8148)
  },
  {
    name: 'Arena logistics bay',
    kind: 'Customer' as const,
    area: box(15.942, 45.769, 15.949, 45.774)
  },
  {
    name: 'Upper Town pedestrian zone',
    kind: 'Restricted' as const,
    area: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [15.9695, 45.8145],
          [15.9765, 45.8149],
          [15.9768, 45.8182],
          [15.9712, 45.8186],
          [15.9695, 45.8145]
        ] as GeoPosition[]
      ]
    },
    description: 'No vehicles but the emergency services'
  },
  {
    name: 'Inner city',
    kind: 'SpeedZone' as const,
    speedLimit: 50,
    area: box(15.95, 45.798, 16.0, 45.82)
  },
  {
    name: 'School zone Trešnjevka',
    kind: 'SpeedZone' as const,
    speedLimit: 30,
    area: box(15.95, 45.8, 15.956, 45.804),
    description: '30 km/h around the schools'
  }
];

const routes = [
  {
    code: 'ZG-CENTER',
    name: 'Depot to the city center',
    description: 'Along Ljubljanska avenue and Savska to the Dolac market',
    corridorMeters: 250,
    path: {
      type: 'LineString' as const,
      coordinates: [
        [15.88, 45.795],
        [15.905, 45.798],
        [15.93, 45.8],
        [15.955, 45.802],
        [15.966, 45.804],
        [15.966, 45.81],
        [15.975, 45.812],
        [15.9775, 45.8135]
      ] as GeoPosition[]
    },
    stops: [
      { name: 'Savska drop-off', location: point(15.966, 45.807) },
      { name: 'Dolac market', location: point(15.9775, 45.8135) }
    ]
  },
  {
    code: 'ZG-ARENA',
    name: 'Depot to the Arena',
    corridorMeters: 300,
    path: {
      type: 'LineString' as const,
      coordinates: [
        [15.88, 45.795],
        [15.9, 45.785],
        [15.925, 45.775],
        [15.9455, 45.7715]
      ] as GeoPosition[]
    },
    stops: [{ name: 'Arena logistics bay', location: point(15.9455, 45.7715) }]
  }
];

/** Geofences and routes around Zagreb, and four vehicles, three of them with a driver. */
export async function createFleet(): Promise<string> {
  for (const geofence of geofences) {
    await db.geofence.create({ data: geofence });
  }

  const routeIds = new Map<string, number>();
  for (const { stops, ...route } of routes) {
    const created = await db.route.create({
      data: {
        ...route,
        stops: {
          create: stops.map((stop, index) => ({
            ...stop,
            sequence: index + 1
          }))
        }
      }
    });
    routeIds.set(route.code, created.id);
  }

  const driverId = async (email: string) =>
    (await db.user.findUniqueOrThrow({ where: { email } })).id;
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

  await db.vehicle.create({
    data: {
      name: 'Van 01',
      plate: 'ZG-1001-AA',
      deviceId: '356938035643801',
      type: 'Van',
      fuelCapacity: 80,
      driverId: await driverId('marko@fleet.example.com'),
      assignedRouteId: routeIds.get('ZG-CENTER'),
      position: point(15.8795, 45.7951),
      fuelLevel: 72,
      odometer: 48_210,
      lastSeenAt: hoursAgo(1)
    }
  });
  await db.vehicle.create({
    data: {
      name: 'Van 02',
      plate: 'ZG-1002-AA',
      deviceId: '356938035643802',
      type: 'Van',
      fuelCapacity: 80,
      driverId: await driverId('ana@fleet.example.com'),
      assignedRouteId: routeIds.get('ZG-ARENA'),
      position: point(15.977, 45.8133),
      heading: 90,
      fuelLevel: 12,
      odometer: 91_455,
      lastSeenAt: hoursAgo(2)
    }
  });
  await db.vehicle.create({
    data: {
      name: 'Truck 01',
      plate: 'ZG-2001-BB',
      deviceId: '356938035643803',
      type: 'Truck',
      speedLimit: 80,
      fuelCapacity: 300,
      driverId: await driverId('ivan@fleet.example.com'),
      position: point(15.9452, 45.7712),
      fuelLevel: 55,
      odometer: 212_870,
      lastSeenAt: hoursAgo(3)
    }
  });
  await db.vehicle.create({
    data: {
      name: 'Car 01',
      plate: 'ZG-3001-CC',
      deviceId: '356938035643804',
      type: 'Car',
      status: 'Maintenance',
      fuelCapacity: 50,
      position: point(15.8801, 45.7948),
      fuelLevel: 40,
      odometer: 23_004,
      lastSeenAt: hoursAgo(48)
    }
  });

  return `Seeded ${geofences.length} geofences, ${routes.length} routes and 4 vehicles`;
}
