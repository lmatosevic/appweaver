import { createService, HttpError } from '@appweaver/core';

export default createService({
  modelName: 'Category',
  // A category as its own parent detaches the branch it holds
  beforeUpdate: (id, data) => {
    const parentId =
      typeof data.parent === 'object' ? data.parent?.id : data.parent;
    if (parentId !== undefined && String(parentId) === String(id)) {
      throw new HttpError('A category cannot be its own parent', 400);
    }
  },
  textSearch: {
    OR: {
      name: {
        contains: '{input}'
      },
      description: {
        contains: '{input}'
      }
    }
  }
});
