# Geo fields and spatial queries

The `geo` section of a resource model declares fields holding geometries: the location of a store, the delivery area
of a restaurant, the route of a delivery. A geo field is read and written like a scalar, as a GeoJSON geometry
(RFC 7946, WGS 84 longitude and latitude), and filtered with the operators `_near`, `_within`, `_withinBox` and
`_intersects`, in every route and `ResourceService` method taking a filter.

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

| Geo field option | Description                                                                                            |
|------------------|--------------------------------------------------------------------------------------------------------|
| `type`           | `point`, `multiPoint`, `lineString`, `multiLineString`, `polygon`, `multiPolygon`, or `geometry` (any) |
| `required`       | Required on creation, `false` makes it nullable (default: `true`, like a scalar)                       |
| `hidden`         | Left out of the API input and output, the filters and the sorts                                        |
| `index`          | Index the field for the spatial queries (default: `true`)                                              |
| `description`    | The description of the field in the OpenAPI specification                                              |
| `example`        | The example of the field in the OpenAPI specification                                                  |

A geo field takes no name of another field of the model, nor of the names derived from its own: its columns
(`<field>MinLng`, `<field>MinLat`, `<field>MaxLng`, `<field>MaxLat`, `<field>Geom`) and its `<field>Distance`. Its name
can be used in the `omit` and `pick` of the `read`, `create` and `update` options. After adding or changing a geo
field, run `weaver generate` and `weaver migration new <name>`.

## Values

A value is a GeoJSON geometry of the type of the field, its positions `[lng, lat]` in degrees:

```json
{ "type": "Point", "coordinates": [15.9819, 45.815] }
{ "type": "Polygon", "coordinates": [[[15.9, 45.75], [16.1, 45.75], [16.1, 45.9], [15.9, 45.9], [15.9, 45.75]]] }
```

- A `point` (or `geometry`) field also takes `{ "lat": 45.815, "lng": 15.9819 }`, stored and returned as a GeoJSON
  point.
- A polygon ring has at least 4 positions and ends with its first one, a line string has at least 2.
- A geometry with an altitude, or of more positions than `spatial.maxVertices` (`10000`), is rejected.
- An invalid value fails with `SPATIAL_INVALID_GEOMETRY` (400), also when written through the Prisma client directly,
  i.e. in a seeder.
- The generated types use the geometry types of `@appweaver/common`: `location: GeoPoint` in the model,
  `location: GeoPoint | GeoLatLng` in its create and update types (`GeoMultiPoint`, `GeoLineString`,
  `GeoMultiLineString`, `GeoPolygon`, `GeoMultiPolygon` and `GeoGeometry` for the other field types).

## Spatial filters

The operators of a geo field combine with every other filter, in the logical operators (`_and`, `_or`, `_not`, `_nor`)
and in the filters of the relations. Distances are in meters, measured on a sphere of the mean radius of the Earth.

| Operator      | Value                                  | Matches the geometries                                     |
|---------------|----------------------------------------|------------------------------------------------------------|
| `_near`       | `{ point, maxDistance, minDistance? }` | Within `maxDistance` of the point (and from `minDistance`) |
| `_within`     | A GeoJSON `Polygon` or `MultiPolygon`  | Covered by it, its boundary included                       |
| `_withinBox`  | `[minLng, minLat, maxLng, maxLat]`     | Covered by the box                                         |
| `_intersects` | Any GeoJSON geometry                   | Sharing at least a point with it                           |
| `_exists`     | `true` / `false`                       | With a value / without one (also `field: null`)            |

The `point` of `_near` is a position `[lng, lat]`, a `{ lat, lng }` object or a GeoJSON point. The distance of a
geometry other than a point is the one to its nearest point, `0` inside a polygon. A `_withinBox` whose `minLng` is
above its `maxLng` crosses the antimeridian, i.e. `[170, -20, -170, -10]`, as the viewport of a map does.

```ts
// The stores within 5 km, nearest first
const { items } = await storeService.query({
  filter: { location: { _near: { point: { lat: 45.8, lng: 15.97 }, maxDistance: 5000 } } },
  sort: 'location'
});
items[0].locationDistance; // 412.7

// The stores of a map viewport, delivering to an address
await storeService.query({
  filter: {
    location: { _withinBox: [15.9, 45.7, 16.1, 45.9] },
    deliveryArea: { _intersects: { type: 'Point', coordinates: [16.0, 45.8] } }
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
{ "filter": { "location": { "_near": { "point": [15.97, 45.8], "maxDistance": 5000 } } }, "sort": "location" }
```

### Distance

A record matched by a `_near` operator on the top level of the filter carries its distance in meters as
`<field>Distance` (`locationDistance`), an optional number of the response and of the generated types. It is left out
with its field by the `read` options and for a hidden field.

Sorting by a geo field (`sort: 'location'`, `'-location'` or `{ location: 'desc' }`) orders the records by that
distance, nearest first, the ties by id. It takes no other sort field, and without a `_near` filter on the field it
fails with `RESOURCE_INVALID_SORT`. The pages, the cursors and the total count work as on any other sort.

### How the operators run, and their limits

- `_withinBox` and `_exists` are conditions of the bounding box columns of the field, run by the database with the
  rest of the query, whatever the number of records they match.
- `_near`, `_within` and `_intersects` are first resolved into the ids of the records they match, by the provider. An
  operator matching more records than `spatial.maxCandidates` (`10000`, at most `2000` on SQL Server) fails with
  `SPATIAL_TOO_MANY_CANDIDATES` (400). The limit counts the records matching the operator alone, before the other
  conditions and the read restrictions, so narrow it down with a smaller radius or polygon.
- An invalid operator fails with `SPATIAL_INVALID_FILTER` (400).
- `_within` and `_intersects` take the longitude and latitude as planar coordinates, like the `geometry` type of
  PostGIS: an edge of a polygon is a straight line in degrees, not a great circle. A stored geometry or a polygon
  crossing the antimeridian (±180°) is not supported, while `_near` and `_withinBox` work across it.

## Storage and providers

Every geo field is stored in three or four columns, on every database:

| Column                    | Holds                                                                                    |
|---------------------------|------------------------------------------------------------------------------------------|
| `<field>`                 | The GeoJSON (`Json`, a `NVARCHAR(MAX)` serialized by the data layer on SQL Server)       |
| `<field>MinLng` … `MaxLat` | Its bounding box, four nullable floats with an index on the minimums                    |
| `<field>Geom`             | With the `postgis` provider, a `geometry(<Type>, 4326)` with a GiST index                |

The data layer writes the bounding box on every write through the Prisma client and leaves it out of the results, so
a record written with plain SQL needs it written too.

The `spatial.provider` config selects how `_near`, `_within` and `_intersects` are matched. It changes the generated
schema, so run `weaver generate` and create a migration after changing it.

| Provider   | Databases  | Matches with                                                                     |
|------------|------------|----------------------------------------------------------------------------------|
| `postgis`  | PostgreSQL | The functions of PostGIS on the geometry column (`ST_DWithin`, `ST_CoveredBy`, `ST_Intersects`) |
| `database` | All        | The bounding box narrows the records in the database, the application matches each geometry    |

`auto` (the default) selects `postgis` on PostgreSQL and `database` on SQLite, MySQL and SQL Server. Set it to
`database` on a PostgreSQL server without PostGIS.

**PostGIS**: the generated schema declares the extension (`extensions = [postgis]`, with the `postgresqlExtensions`
preview feature of Prisma), so the first migration runs `CREATE EXTENSION IF NOT EXISTS "postgis"`, which needs a
server with PostGIS installed, i.e. the `postgis/postgis` Docker image (or `timescale/timescaledb-ha`, which has both
TimescaleDB and PostGIS). The geometry column is written by the trigger `<table>_geo_sync` of its table, on an insert
and on an update changing the GeoJSON, so a write with plain SQL keeps it in line too. `SpatialService` creates the
trigger at startup when it is missing or the geo fields of the model changed, and then writes the geometries missing,
within `spatial.setupTimeout`. A start with the triggers in place changes nothing in the database.

- The trigger is not part of the Prisma schema, so it causes no migration drift, and a migration can drop a geo field
  before the next start replaces it.
- The database user needs the right to create functions and triggers.
- A model that lost its geo fields, or a switch to the `database` provider, leaves a trigger doing nothing: drop it
  with `DROP FUNCTION "<table>_geo_sync" CASCADE`.

## Configuration

| Key                     | Env                      | Default | Description                                                     |
|-------------------------|--------------------------|---------|-----------------------------------------------------------------|
| `spatial.provider`      | `SPATIAL_PROVIDER`       | `auto`  | `auto`, `postgis` or `database`                                 |
| `spatial.maxCandidates` | `SPATIAL_MAX_CANDIDATES` | `10000` | Maximum records a `_near`, `_within` or `_intersects` matches   |
| `spatial.maxVertices`   | `SPATIAL_MAX_VERTICES`   | `10000` | Maximum positions of a geometry, written or in a filter         |
| `spatial.setupTimeout`  | `SPATIAL_SETUP_TIMEOUT`  | `60000` | Milliseconds the `postgis` provider takes to set up at startup  |

## Programmatic use

`SpatialService` of `@appweaver/data` finds the records of a model matching a condition, nearest first for a `near`
one (`match`). The helpers of `@appweaver/common` work on GeoJSON values: `normalizeGeometry`, `geometryBox`,
`geoDistance` (haversine, meters), `geometryDistance`, `geometryCoveredBy` and `geometryIntersects`.

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
