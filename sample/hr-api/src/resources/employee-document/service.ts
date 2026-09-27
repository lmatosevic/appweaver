import { createService } from '@appweaver/core';

export default createService({
  modelName: 'EmployeeDocument',
  textSearch: {
    title: {
      contains: '{input}'
    }
  }
});
