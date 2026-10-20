import { ErrorCode, RequestError } from '@appweaver/common';
import { createService } from '@appweaver/data';
import { inject, LocaleService } from '@appweaver/core';

export default createService({
  modelName: 'Category',
  // Stored in the default locale, the LOCALE_DEFAULT config
  beforeCreate: (data) => {
    data.description ??= inject(LocaleService).translate(
      'category.defaultDescription',
      undefined,
      { name: data.name }
    );
  },
  // A category as its own parent detaches the branch it holds
  beforeUpdate: (id, data) => {
    const parentId =
      typeof data.parent === 'object' ? data.parent?.id : data.parent;
    if (parentId !== undefined && String(parentId) === String(id)) {
      throw new RequestError(
        ErrorCode.ValidationFailed,
        'A category cannot be its own parent',
        {
          errors: [
            {
              field: 'parent',
              rule: 'notSelf',
              message: 'cannot be the category itself'
            }
          ]
        }
      );
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
