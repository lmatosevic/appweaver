import { createService, HttpError } from '@appweaver/core';
import { ResourceId } from '@appweaver/common';
import { CategoryCreate, CategoryUpdate } from '@/types';

export default createService<any, CategoryCreate, CategoryUpdate>({
  modelName: 'Category',
  // A category as its own parent detaches the branch it holds
  beforeUpdate: (id: ResourceId, data: CategoryUpdate) => {
    const parentId =
      typeof data.parent === 'object' ? data.parent?.id : data.parent;
    if (parentId !== undefined && String(parentId) === String(id)) {
      throw new HttpError('A category cannot be its own parent', 400);
    }
  },
  textSearch: {
    OR: {
      name: {
        contains: '{input}',
        mode: 'insensitive'
      },
      description: {
        contains: '{input}',
        mode: 'insensitive'
      }
    }
  }
});
