# Vehicle Tracking API

> Appweaver sample - Vehicle tracking API with live positions, trips, routes, geofences and telemetry

The backend of a delivery fleet in Zagreb: trackers report the position and the readings of each vehicle through a
telematics gateway. The API keeps the live map, records the trips with the path they drove, raises alerts against the
geofences and the planned routes, and stores every reading as a time series. It runs on PostgreSQL with PostGIS for
the geo fields and TimescaleDB for the readings, both in the `timescale/timescaledb-ha` image.

## What it showcases

| Feature                                                                                                          | Where                                                                                                                                                |
|------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Geo fields** of every type: a point (`position`), a polygon (`area`), a line string (`path`)                    | [`vehicle`](src/resources/vehicle/model.ts), [`geofence`](src/resources/geofence/model.ts), [`route`](src/resources/route/model.ts), [`trip`](src/resources/trip/model.ts) |
| The `postgis` spatial provider: `geometry` columns with GiST indexes, written by a trigger                        | [`appweaver.json`](appweaver.json), [`database/migrations/`](database/migrations)                                                                     |
| `_intersects` with a point: the geofences a vehicle is in, on every ping                                         | [`features/telemetry/ingest.ts`](src/features/telemetry/ingest.ts)                                                                                    |
| `_near` with the distance sort, and a relation filter: the nearest free vehicles, with an arrival estimate       | [`features/fleet/nearest-vehicles-route.ts`](src/features/fleet/nearest-vehicles-route.ts)                                                            |
| `_within` a polygon, and `_intersects` with a line string: the vehicles in a geofence, the trips through it       | [`features/fleet/geofence-routes.ts`](src/features/fleet/geofence-routes.ts)                                                                          |
| The geo helpers of `@appweaver/common`: `geoDistance`, `geometryDistance` (off the route), a path built per ping | [`features/telemetry/geometry.ts`](src/features/telemetry/geometry.ts)                                                                                |
| **Time series** of the readings (speed, fuel, engine temperature, battery, odometer, ignition) in a hypertable   | [`resources/vehicle/model.ts`](src/resources/vehicle/model.ts)                                                                                        |
| A trip report aggregating the series over the trip (`avg`, `max`, `min`, `first`, `last`, buckets)              | [`features/trips/trip-summary-route.ts`](src/features/trips/trip-summary-route.ts)                                                                    |
| **API key** authentication of a machine client, the telematics gateway, with a rate limit                        | [`features/telemetry/telemetry-route.ts`](src/features/telemetry/telemetry-route.ts)                                                                  |
| Pings applied in a transaction locking their vehicle (`SELECT ... FOR UPDATE`), so concurrent requests serialize | [`features/telemetry/ingest.ts`](src/features/telemetry/ingest.ts)                                                                                    |
| Pure, unit tested alert rules: speed zones, low fuel, fuel used                                                 | [`features/telemetry/rules.ts`](src/features/telemetry/rules.ts)                                                                                      |
| A scheduled job ending the trips of the vehicles whose tracker went silent                                      | [`features/trips/signal-lost-job.ts`](src/features/trips/signal-lost-job.ts)                                                                          |
| A `weaver run` task driving a vehicle along its route, as its tracker would report it                            | [`tasks/simulate-trip.ts`](src/tasks/simulate-trip.ts)                                                                                                |
| Read restrictions: the drivers see their own vehicles, readings and trips                                       | vehicle and trip policies                                                                                                                            |
| Fields the API never writes (`create` / `update` `omit`), virtual fields (`online`, `lengthMeters`, `open`)      | vehicle, route and alert models                                                                                                                      |
| An application error code (`ALERT_ALREADY_ACKNOWLEDGED`) and a conditional update                               | [`features/alerts/acknowledge-route.ts`](src/features/alerts/acknowledge-route.ts)                                                                    |
| Separate database users: the migrations run as the owner, the application only reads and writes the rows        | [`appweaver.json`](appweaver.json), [`database/postgres-init.sh`](database/postgres-init.sh)                                                          |

## How the telemetry works

Each ping of `POST /api/telemetry` carries a tracker's IMEI (`deviceId`), a position, the speed, the ignition and
optional readings. The pings are applied in time order, each in its own transaction:

1. A ping older than the last one of its vehicle is **stale**: it is only recorded in the time series.
2. The geofences covering the new and the previous position are compared. Entering or leaving one is an `Info`
   alert, and entering a `Restricted` one is a `Critical` alert.
3. The speed limit is the lowest of the vehicle's `speedLimit` and those of the `SpeedZone` geofences it is in.
   Exceeding it by more than 5 km/h raises one `Speeding` warning per excursion.
4. The ignition turning on starts a trip on the vehicle's assigned route. Each ping then extends its path (a vertex
   every 10 m or more), its distance, its top speed and the fuel used, until the ignition turns off.
5. On a route, leaving its corridor (`corridorMeters`) raises an `OffRoute` warning, and coming within the radius of a
   stop raises a `StopArrival`.
6. A fuel level dropping below 15 % raises a `LowFuel` warning.

A trip whose vehicle has been silent for 30 minutes is ended by the job, with a `SignalLost` warning.

## Getting started

Build the monorepo once from the repository root (`npm install && npm run build`), then in this directory:

```bash
cp .env.example .env              # NODE_ENV=dev and the passwords of the database users
docker compose up -d postgres     # PostgreSQL 18 with PostGIS and TimescaleDB on :5433
npm run build                     # the models the setup of the migrations reads
npm run migrate                   # apply the migrations, then set up the hypertable and the geometry triggers
npm run seed                      # roles, staff, geofences and routes around Zagreb, four vehicles
npm run dev                       # http://localhost:5008, Swagger UI at http://localhost:5008/swagger
```

The database listens on port **5433** of the host, so it runs beside a local PostgreSQL on 5432. `docker compose up`
runs the whole stack instead, its containers setting the `DB_HOST` and `DB_PORT` that the URL in
[`appweaver.json`](appweaver.json) references.

The database has two users. The migrations run as its owner (`DB_MIGRATION_USER`, `database.migrationUrl`), which
creates the tables, the `postgis` and `timescaledb` extensions, the hypertable of the readings and the geometry
triggers, while the application connects as `DB_USER` (`database.url`), which
[`database/postgres-init.sh`](database/postgres-init.sh) creates when the container initializes its volume, allowed
only to read and write the rows of the tables. The application container gets no password of the owner. Run
`npm run migrate` again after a change of the geo or the series fields, since the application cannot replace a trigger
or a hypertable itself, and fails to start, asking for it, when one is out of date. The end-to-end tests run as the
owner.

The seeder prints the generated admin password (`admin@fleet.example.com`) and the **telematics gateway API key**.
Keep the key, since it is not shown again. The dispatcher `dispatch@fleet.example.com` and the drivers
`james@fleet.example.com`, `olivia@fleet.example.com` and `henry@fleet.example.com` sign in with `Passw0rd!`.

## Try it out

```bash
# Drive Van 01 along its route ZG-CENTER: 69 pings through the depot, a school zone and two stops
npm run simulate -- ZG-1001-AA
npm run simulate -- ZG-1001-AA --speed 70 --realtime   # one ping every 10 s, watch the map move

DISPATCH=$(curl -s localhost:5008/auth/login -H 'content-type: application/json' \
  -d '{"username":"dispatch@fleet.example.com","password":"Passw0rd!"}' | jq -r .accessToken)

# The open alerts, the latest first
curl -s localhost:5008/api/alerts/query -H "authorization: Bearer $DISPATCH" -H 'content-type: application/json' \
  -d '{"filter":{"severity":{"_ne":"Info"},"acknowledgedAt":null},"sort":"-occurredAt"}' | jq '.items[] | {id, type, message}'
curl -s -X POST localhost:5008/api/alerts/<id>/acknowledge -H "authorization: Bearer $DISPATCH" | jq .open

# The nearest free vehicles to the main square, with an arrival estimate
curl -s "localhost:5008/api/vehicles/nearest?lat=45.8131&lng=15.9773&radius=15000" -H "authorization: Bearer $DISPATCH" \
  | jq '.items[] | {name: .vehicle.name, distanceMeters, etaMinutes}'

# The vehicles of a map viewport [minLng, minLat, maxLng, maxLat]
curl -s localhost:5008/api/vehicles/query -H "authorization: Bearer $DISPATCH" -H 'content-type: application/json' \
  -d '{"filter":{"position":{"_withinBox":[15.85,45.75,16.05,45.85]}}}' | jq '.items[] | {name, position, online}'

# The vehicles in the depot, and the trips that drove through the school zone
curl -s localhost:5008/api/geofences/1/vehicles -H "authorization: Bearer $DISPATCH" | jq '.items[].name'
curl -s localhost:5008/api/geofences/6/trips -H "authorization: Bearer $DISPATCH" | jq '.items[] | {id, distanceMeters}'

# The report of a trip, and the speed of Van 01 by minute
curl -s "localhost:5008/api/trips/1/summary?bucket=1m" -H "authorization: Bearer $DISPATCH" | jq
curl -s "localhost:5008/api/vehicles/1/series?fields=speed,fuelLevel&bucket=1m&aggregate=avg" -H "authorization: Bearer $DISPATCH"
```

The gateway reports the pings of many trackers at once, each at the current time unless it gives a `time`:

```bash
curl -s localhost:5008/api/telemetry -H "x-api-key: $GATEWAY_KEY" -H 'content-type: application/json' -d '{
  "pings": [
    { "deviceId": "356938035643803", "position": { "lat": 45.7712, "lng": 15.9452 }, "speed": 0, "ignition": true, "fuelLevel": 55 },
    { "deviceId": "356938035643802", "position": [15.9765, 45.8160], "speed": 25, "ignition": true, "fuelLevel": 11.5 }
  ]
}'
# {"accepted":2,"stale":0,"rejected":[],"alerts":3}: both start a trip, and Van 02 left the central market, drove
# into the pedestrian zone, and away from its route ZG-ARENA
```

## Tests

```bash
npm run test  # unit tests of the geometry and the alert rules
npm run e2e   # end-to-end tests, against the vehicle-tracking-api-test database of the container
```

The end-to-end tests need the PostgreSQL container running. Their files run one at a time (`maxWorkers: 1` in
[`jest.e2e-config.json`](test/e2e/jest.e2e-config.json)), because each one resets the test database once it is
done.

## License

UNLICENSED
