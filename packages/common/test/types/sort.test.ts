import { GeoPoint } from '../../types/geo';
import { QuerySort } from '../../types/sort';

type Store = { id: number; name: string; location: GeoPoint };

// The sorts are checked by the compiler (npm run test:typecheck), the tests
// only hold them
describe('QuerySort', () => {
  test('sorts a geo field by a direction, its distance', () => {
    const sort: QuerySort<Store> = { location: 'asc' };
    // @ts-expect-error a geo field has no nested field to sort by
    const wrong: QuerySort<Store> = { location: { type: 'asc' } };

    expect([sort, wrong]).toHaveLength(2);
  });
});
