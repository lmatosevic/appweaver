import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Position',
  scalars: {
    title: {
      type: 'string',
      minLength: 2,
      maxLength: 150,
      example: 'Backend Engineer'
    },
    level: {
      type: 'enum',
      values: ['Junior', 'Mid', 'Senior', 'Lead', 'Principal'],
      default: 'Mid'
    },
    // The salary band new offers and raises are checked against
    salaryMin: {
      type: 'float',
      minimum: 0,
      example: 30000
    },
    salaryMax: {
      type: 'float',
      minimum: 0,
      example: 45000
    },
    openings: {
      type: 'int',
      default: 0,
      minimum: 0
    }
  },
  relations: {
    department: {
      model: 'Department',
      type: 'oneToMany',
      mappedBy: 'positions',
      owner: true,
      onDelete: 'cascade',
      output: {
        type: 'always'
      }
    },
    employees: {
      model: 'Employee',
      type: 'oneToMany',
      mappedBy: 'position',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    }
  },
  unique: [['departmentId', 'title', 'level']]
});
