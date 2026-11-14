import { GeoBox, geoColumns } from '@appweaver/common';

/**
 * The condition of the bounding box columns of the geometries covered by one of the boxes, which is exact: a
 * geometry lies in a box when its own box does. The upper bounds of the minimums repeat the ones of the maximums,
 * for the index on the minimums.
 *
 * @param {string} field - The geo field.
 * @param {GeoBox[]} boxes - The boxes.
 * @return {Object} The Prisma condition.
 */
export function boxWithinFilter(
  field: string,
  boxes: GeoBox[]
): Record<string, any> {
  const columns = geoColumns(field);
  return anyOf(
    boxes.map(([minLng, minLat, maxLng, maxLat]) => ({
      [columns.minLng]: { gte: minLng, lte: maxLng },
      [columns.minLat]: { gte: minLat, lte: maxLat },
      [columns.maxLng]: { lte: maxLng },
      [columns.maxLat]: { lte: maxLat }
    }))
  );
}

/**
 * The condition of the bounding box columns of the geometries whose box overlaps one of the boxes, the only ones
 * that can share a point with it.
 *
 * @param {string} field - The geo field.
 * @param {GeoBox[]} boxes - The boxes.
 * @param {boolean} [point=false] - Whether the field holds points, whose minimums equal their maximums, so the
 * index on the minimums bounds both sides.
 * @return {Object} The Prisma condition.
 */
export function boxOverlapFilter(
  field: string,
  boxes: GeoBox[],
  point: boolean = false
): Record<string, any> {
  const columns = geoColumns(field);
  return anyOf(
    boxes.map(([minLng, minLat, maxLng, maxLat]) =>
      point
        ? {
            [columns.minLng]: { gte: minLng, lte: maxLng },
            [columns.minLat]: { gte: minLat, lte: maxLat }
          }
        : {
            [columns.minLng]: { lte: maxLng },
            [columns.minLat]: { lte: maxLat },
            [columns.maxLng]: { gte: minLng },
            [columns.maxLat]: { gte: minLat }
          }
    )
  );
}

/**
 * The condition of the records with a value of a geo field, or without one. The bounding box columns are null
 * exactly when the geometry is, whichever null its JSON column holds.
 *
 * @param {string} field - The geo field.
 * @param {boolean} exists - Whether the records have a value.
 * @return {Object} The Prisma condition.
 */
export function existsFilter(
  field: string,
  exists: boolean
): Record<string, any> {
  return { [geoColumns(field).minLng]: exists ? { not: null } : null };
}

function anyOf(conditions: Record<string, any>[]): Record<string, any> {
  return conditions.length === 1 ? conditions[0] : { OR: conditions };
}
