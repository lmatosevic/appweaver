# Geo fields and spatial queries

The `geo` section of a resource model declares fields holding geometries: the location of a store, the delivery area
of a restaurant, the route of a delivery. A geo field is read and written like a scalar, as a GeoJSON geometry
(RFC 7946, WGS 84 longitude and latitude), and filtered with the spatial operators `_near`, `_within`, `_withinBox` and
`_intersects`, in the query, count, export and aggregate routes and every method of the `ResourceService` taking a
filter.

## Declaring geo fields

```ts
import { createModel } from '@appweaver/data';

export default createModel({
  name: 'Store',
  scalars: {
    name: { type: 'string', maxLength: 255 }
  },
  geo: {
    location: { type: 'point', description: 'Where the store is' },
    deliveryArea: { type: 'polygon', required: false },
    route: { type: 'lineString', required: false, index: false }
  }
});
```

| Geo field option | Description                                                                                          |
|------------------|------------------------------------------------------------------------------------------------------|
| `type`           | `point`, `multiPoint`, `lineString`, `multiLineString`, `polygon`, `multiPolygon`, or `geometry` (any) |
| `required`       | Required on creation, `false` makes it nullable (default: `true`, like a scalar)                     |
| `hidden`         | Left out of the API output, the filters and the sorts                                                |
| `index`          | Index the field for the spatial queries (default: `true`)                                            |
| `description`    | The description of the field in the OpenAPI specification                                            |
| `example`        | The example of the field in the OpenAPI specification                                                |

A geo field is named like any field and takes no name of another field of the model, nor of the columns it keeps
beside its own (`<field>MinLng`, `<field>MinLat`, `<field>MaxLng`, `<field>MaxLat`, `<field>Geom`). Its name can be
used in the `omit` and `pick` of the `read`, `create` and `update` options. After adding or changing a geo field, run
`weaver generate` and `weaver migration new <name>`.

## Values

A value is a GeoJSON geometry of the type of the field, its positions `[lng, lat]` in degrees:

```json
{ "type": "Point", "coordinates": [15.9819, 45.815] }
{ "type": "Polygon", "coordinates": [[[15.9, 45.75], [16.1, 45.75], [16.1, 45.9], [15.9, 45.9], [15.9, 45.75]]] }
```

- A `point` (or `geometry`) field also takes `{ "lat": 45.815, "lng": 15.9819 }`, stored and returned as a GeoJSON point.
- A polygon ring has at least 4 positions and ends with its first one, a line string has at least 2.
- An altitude (a third coordinate) is rejected by the request validation and dropped by the data layer.
- A geometry of more positions than `spatial.maxVertices` (`10000`) is rejected.
- An invalid value fails with `SPATIAL_INVALID_GEOMETRY` (400), also when written through the Prisma client directly,
  i.e. in a seeder, since the data layer checks it in a Prisma client extension.
- The generated types type each field as its GeoJSON geometry, i.e. `{ type: 'Point'; coordinates: [number, number] }`,
  and the shared types `GeoPoint`, `GeoPolygon`, `GeoGeometry`, `GeoLatLng`, ... come from `@appweaver/common`.

## Spatial filters

The operators of a geo field, combined with every other filter, in a logical operator (`_and`, `_or`, `_not`, `_nor`)
and in the filters of the relations. Distances are in meters, measured on a sphere of the mean radius of the Earth.

| Operator      | Value                                                     | Matches the geometries                               |
|---------------|-----------------------------------------------------------|------------------------------------------------------|
| `_near`       | `{ point, maxDistance, minDistance? }`                    | Within `maxDistance` of the point (and from `minDistance`) |
| `_within`     | A GeoJSON `Polygon` or `MultiPolygon`                     | Covered by it, its boundary included                 |
| `_withinBox`  | `[minLng, minLat, maxLng, maxLat]`                        | Covered by the box                                   |
| `_intersects` | Any GeoJSON geometry                                      | Sharing at least a point with it                     |
| `_exists`     | `true` / `false`                                          | With a value / without one (also `field: null`)      |

The `point` of `_near` is a position `[lng, lat]`, a `{ lat, lng }` object or a GeoJSON point. The distance of a
geometry other than a point is the one to its nearest point, `0` inside a polygon.

```ts
// The stores within 5 km, nearest first
await storeService.query({
  filter: { location: { _near: { point: { lat: 45.8, lng: 15.97 }, maxDistance: 5000 } } },
  sort: 'location'
});

// The stores delivering to an address, in a city
await storeService.query({
  filter: {
    deliveryArea: { _intersects: { type: 'Point', coordinates: [16.0, 45.8] } },
    city: { name: 'Zagreb' }
  }
});

// The nearest store
const nearest = await storeService.single(
  { location: { _near: { point: [15.97, 45.8], maxDistance: 50_000 } } },
  'location'
);
```

```http
POST /api/stores/query
{ "filter": { "location": { "_withinBox": [15.9, 45.7, 16.1, 45.9] } }, "size": 20 }
```

### Sorting by distance

Sorting by a geo field (`sort: 'location'` or `'-location'`, `{ location: 'desc' }`) orders the records by their
distance from the point of the `_near` operator of that field on the top level of the filter, nearest first, the ties by
id. It takes no other sort field, and without a `_near` filter on the field it fails with `RESOURCE_INVALID_SORT`. The
matching ids are ordered in memory, so the pages, the cursors and the total count work as on any other sort.

### Limits

A spatial operator is resolved into the ids of the records it matches before the rest of the query runs, so:

- An operator matching more records than `spatial.maxCandidates` (`10000`, at most `2000` on SQL Server) fails with
  `SPATIAL_TOO_MANY_CANDIDATES` (400). The limit counts the records matching the operator alone, before the other
  conditions and the read restrictions, so narrow it down with a smaller radius or box.
- An invalid operator fails with `SPATIAL_INVALID_FILTER` (400).
- The longitude and latitude are taken as planar coordinates by `_within`, `_withinBox` and `_intersects`, like the
  `geometry` type of PostGIS: an edge of a polygon is a straight line in degrees, not a great circle, and a geometry
  crossing the antimeridian (±180°) is not supported.

## Providers

The `spatial.provider` config selects how the geo fields are stored and queried, and changes the generated schema, so
run `weaver generate` and create a migration after changing it.

| Provider   | Databases  | Storage                                                                            | Queries                                                       |
|------------|------------|------------------------------------------------------------------------------------|---------------------------------------------------------------|
| `postgis`  | PostgreSQL | The GeoJSON column and a `geometry(<Type>, 4326)` column (`<field>Geom`) with a GiST index | The functions of PostGIS (`ST_DWithin`, `ST_CoveredBy`, `ST_Intersects`) |
| `database` | All        | The GeoJSON column and the bounding box columns (`<field>MinLng`, ...), indexed   | The bounding box narrows the records, the application matches each geometry |

`auto` (the default) selects `postgis` on PostgreSQL and `database` on SQLite, MySQL and SQL Server. Set
`spatial.provider` to `database` on a PostgreSQL server without PostGIS.

**PostGIS**: the generated schema declares the extension (`extensions = [postgis]`, with the `postgresqlExtensions`
preview feature of Prisma), so the first migration runs `CREATE EXTENSION IF NOT EXISTS "postgis"`, which needs a
server with PostGIS installed, i.e. the `postgis/postgis` Docker image (or `timescale/timescaledb-ha`, which has both
TimescaleDB and PostGIS). At startup, `SpatialService` creates the trigger `<table>_geo_sync` of each table, writing the
geometry columns from the GeoJSON on every insert and update, and fills the geometries missing. The trigger is not part
of the Prisma schema, so it causes no migration drift, and a migration can drop a geo field before the next start
updates it. The database user needs the right to create functions and triggers.

**Database**: the data layer writes the bounding box columns of a geo field on every write through the Prisma client
and leaves them out of the results, so a record written with plain SQL needs them written too.

On SQL Server, the GeoJSON column is a `NVARCHAR(MAX)` serialized by the data layer, like a `json` scalar.

## Configuration

| Key                       | Env                      | Default | Description                                                  |
|---------------------------|--------------------------|---------|--------------------------------------------------------------|
| `spatial.provider`        | `SPATIAL_PROVIDER`       | `auto`  | `auto`, `postgis` or `database`                              |
| `spatial.maxCandidates`   | `SPATIAL_MAX_CANDIDATES` | `10000` | Maximum records a spatial operator matches                   |
| `spatial.maxVertices`     | `SPATIAL_MAX_VERTICES`   | `10000` | Maximum positions of a geometry, written or in a filter      |

## Programmatic use

`SpatialService` of `@appweaver/data` resolves the spatial operators of a filter (`resolveFilter`) and finds the records
of a model matching a condition, nearest first for a `near` one (`match`). The helpers of `@appweaver/common` work on
GeoJSON values: `normalizeGeometry`, `geometryBox`, `geoDistance` (haversine, meters), `geometryDistance`,
`geometryCoveredBy`, `geometryIntersects` and `spatialCondition`.

```ts
import { inject } from '@appweaver/core';
import { SpatialService } from '@appweaver/data';

const matches = await inject(SpatialService).match('Store', 'location', {
  operator: 'near',
  point: [15.97, 45.8],
  maxDistance: 2000
});
// [{ id: 3, distance: 412.7 }, { id: 1, distance: 1890.2 }]
```
