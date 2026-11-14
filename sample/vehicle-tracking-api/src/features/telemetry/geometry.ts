import { geoDistance, GeoPosition } from '@appweaver/common';

/** A path vertex is added once the vehicle moved this far from the last one, so the GPS jitter of a parked vehicle
 * adds no distance. */
export const MIN_VERTEX_METERS = 10;

/** The most vertices a trip path keeps, below the `spatial.maxVertices` of the framework. */
export const MAX_PATH_VERTICES = 9_000;

/** The length in meters of a line, the sum of its great circle segments. */
export function lineLength(positions: GeoPosition[]): number {
  let length = 0;
  for (let i = 1; i < positions.length; i++) {
    length += geoDistance(positions[i - 1], positions[i]);
  }
  return length;
}

/**
 * Extends the path of a trip with a position: the vertices of a path, from its first position, and the distance added.
 * A position closer than `MIN_VERTEX_METERS` to the last vertex adds nothing, and a full path keeps its vertices while
 * still counting the distance.
 */
export function extendPath(
  vertices: GeoPosition[],
  position: GeoPosition
): { vertices: GeoPosition[]; added: number } {
  const last = vertices.at(-1);
  if (!last) {
    return { vertices: [position], added: 0 };
  }

  const added = geoDistance(last, position);
  if (added < MIN_VERTEX_METERS) {
    return { vertices, added: 0 };
  }
  if (vertices.length >= MAX_PATH_VERTICES) {
    return { vertices: [...vertices.slice(0, -1), position], added };
  }
  return { vertices: [...vertices, position], added };
}

/** The compass bearing in degrees from one position to another, `0` for the north, clockwise. */
export function bearing(from: GeoPosition, to: GeoPosition): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const [lng1, lat1] = from.map(toRadians);
  const [lng2, lat2] = to.map(toRadians);
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * The positions every `step` meters along a line, from its first position to its last one, i.e. the pings of a
 * vehicle driving it.
 */
export function interpolateLine(
  positions: GeoPosition[],
  step: number
): GeoPosition[] {
  if (positions.length === 0) {
    return [];
  }

  const result: GeoPosition[] = [positions[0]];
  let carried = 0;
  for (let i = 1; i < positions.length; i++) {
    const [from, to] = [positions[i - 1], positions[i]];
    const length = geoDistance(from, to);
    let at = step - carried;
    while (at < length) {
      const ratio = at / length;
      result.push([
        from[0] + (to[0] - from[0]) * ratio,
        from[1] + (to[1] - from[1]) * ratio
      ]);
      at += step;
    }
    carried = length - (at - step);
  }

  const last = positions.at(-1)!;
  if (result.at(-1) !== last) {
    result.push(last);
  }
  return result;
}
