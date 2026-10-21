import * as sections from '../../config';
import manifest from '../../modules/core';

describe('module', () => {
  test('lists every config section of the package', () => {
    // A section is frozen, unlike the enums exported beside it
    const all = Object.values(sections).filter((value) =>
      Object.isFrozen(value)
    );

    expect(new Set(manifest.config)).toEqual(new Set(all));
  });
});
