import { createService } from '@appweaver/data';

export default createService({
  modelName: 'EmployeeDocument',
  textSearch: {
    title: {
      contains: '{input}'
    }
  }
});
