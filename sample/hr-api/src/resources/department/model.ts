import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Department',
  scalars: {
    name: {
      type: 'string',
      unique: true,
      minLength: 2,
      maxLength: 100,
      example: 'Engineering'
    },
    code: {
      type: 'string',
      unique: true,
      pattern: '^[A-Z]{2,6}$',
      example: 'ENG'
    },
    description: {
      type: 'string',
      required: false,
      maxLength: 1000
    },
    costCenter: {
      type: 'string',
      required: false,
      maxLength: 32,
      example: 'CC-1200'
    }
  },
  relations: {
    // A single employee heads a single department
    head: {
      model: 'Employee',
      type: 'oneToOne',
      mappedBy: 'headOf',
      owner: true,
      required: false,
      output: {
        type: 'always'
      }
    },
    employees: {
      model: 'Employee',
      type: 'oneToMany',
      mappedBy: 'department',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    positions: {
      model: 'Position',
      type: 'oneToMany',
      mappedBy: 'department',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single'
      }
    }
  }
});
