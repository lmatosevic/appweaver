import { QueryFilter, RelationId } from '../../types/filter';

type Author = { id: string; name: string };
type Tag = { id: number; name: string };
type Post = { id: number; title: string; author: Author; tags: Tag[] };

// The filters are checked by the compiler (npm run test:typecheck), the tests
// only hold them
describe('QueryFilter', () => {
  test('matches a single relation by the id type of the related model', () => {
    const filter: QueryFilter<Post> = {
      author: '01a0e1dc-a3ca-7717-ab6a-a03242d7dc20'
    };
    const list: QueryFilter<Post> = { author: ['a', 'b'] };
    // @ts-expect-error the author has a string id
    const wrong: QueryFilter<Post> = { author: 12 };

    expect([filter, list, wrong]).toHaveLength(3);
  });

  test('matches a list relation by the id type of the related model', () => {
    const filter: QueryFilter<Post> = { tags: [1, 2] };
    // @ts-expect-error the tags have numeric ids
    const wrong: QueryFilter<Post> = { tags: ['1'] };

    expect([filter, wrong]).toHaveLength(2);
  });
});

describe('RelationId', () => {
  test('falls back to a numeric id for a model without one', () => {
    const id: RelationId<{ name: string }> = 1;

    expect(id).toBe(1);
  });
});
