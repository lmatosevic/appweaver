import { createAuthModel } from '@appweaver/core';

export default createAuthModel({
  name: 'Employee',
  // Hard to guess in URLs, and safe to hand out to other systems
  id: {
    generator: 'uuid(7)'
  },
  // Keeps the history of a removed employee, together with everything they
  // own, for audits and manual restores
  softDelete: true,
  scalars: {
    employeeNumber: {
      type: 'string',
      unique: true,
      pattern: '^EMP-\\d{4,}$',
      example: 'EMP-0042'
    },
    firstName: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      example: 'Emily'
    },
    lastName: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      example: 'Parker'
    },
    email: {
      type: 'string',
      unique: true,
      format: 'email',
      maxLength: 255,
      example: 'emily.parker@hr.example.com'
    },
    phone: {
      type: 'string',
      required: false,
      maxLength: 32,
      example: '+15035550123'
    },
    employmentType: {
      type: 'enum',
      values: ['FullTime', 'PartTime', 'Contractor', 'Intern'],
      default: 'FullTime'
    },
    status: {
      type: 'enum',
      values: ['Active', 'OnLeave', 'Terminated'],
      default: 'Active'
    },
    hireDate: {
      type: 'dateTime',
      example: '2024-03-01T00:00:00.000Z'
    },
    terminatedAt: {
      type: 'dateTime',
      required: false
    }
  },
  relations: {
    department: {
      model: 'Department',
      type: 'oneToMany',
      mappedBy: 'employees',
      owner: true,
      required: false,
      output: {
        type: 'always'
      }
    },
    position: {
      model: 'Position',
      type: 'oneToMany',
      mappedBy: 'employees',
      owner: true,
      required: false,
      output: {
        type: 'always'
      }
    },
    // The reporting line, read one level up
    manager: {
      model: 'Employee',
      type: 'oneToMany',
      mappedBy: 'reports',
      owner: true,
      required: false,
      output: {
        type: 'always'
      }
    },
    reports: {
      model: 'Employee',
      type: 'oneToMany',
      mappedBy: 'manager',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single',
        count: true
      }
    },
    headOf: {
      model: 'Department',
      type: 'oneToOne',
      mappedBy: 'head',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    },
    leaveBalances: {
      model: 'LeaveBalance',
      type: 'oneToMany',
      mappedBy: 'employee',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single'
      }
    },
    leaveRequests: {
      model: 'LeaveRequest',
      type: 'oneToMany',
      mappedBy: 'employee',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    decidedLeaveRequests: {
      model: 'LeaveRequest',
      type: 'oneToMany',
      mappedBy: 'decidedBy',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    },
    documents: {
      model: 'EmployeeDocument',
      type: 'oneToMany',
      mappedBy: 'employee',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    compensations: {
      model: 'Compensation',
      type: 'oneToMany',
      mappedBy: 'employee',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    },
    reviews: {
      model: 'PerformanceReview',
      type: 'oneToMany',
      mappedBy: 'employee',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    },
    writtenReviews: {
      model: 'PerformanceReview',
      type: 'oneToMany',
      mappedBy: 'reviewer',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  },
  files: {
    avatar: {
      mimeType: 'image/(jpeg|png|webp)',
      namePattern: 'avatars/{resourceId}-{hash}.{extension}',
      maxSize: '3 MB',
      image: {
        quality: 80,
        width: 256,
        height: 256,
        fit: 'cover'
      }
    }
  },
  virtual: {
    fullName: {
      type: 'string',
      example: 'Emily Parker',
      input: {
        type: 'none'
      },
      output: {
        value: (employee: { firstName: string; lastName: string }) =>
          `${employee.firstName} ${employee.lastName}`
      }
    },
    yearsOfService: {
      type: 'int',
      example: 2,
      input: {
        type: 'none'
      },
      output: {
        type: 'single',
        value: (employee: { hireDate: Date | string }) =>
          yearsSince(new Date(employee.hireDate))
      }
    }
  },
  // Assigned by the service and changed by the termination only
  create: {
    omit: ['employeeNumber', 'status', 'terminatedAt']
  },
  update: {
    omit: ['employeeNumber', 'terminatedAt']
  },
  export: {
    avatar: {
      exclude: true
    },
    hireDate: {
      headerName: 'Hire date',
      mapValue: (value: Date) => new Date(value).toISOString().slice(0, 10)
    },
    department: {
      headerName: 'Department',
      mapValue: 'name'
    },
    position: {
      headerName: 'Position',
      mapValue: 'title'
    },
    manager: {
      headerName: 'Manager',
      mapValue: (manager: { firstName: string; lastName: string } | null) =>
        manager ? `${manager.firstName} ${manager.lastName}` : ''
    }
  },
  index: [
    ['deletedAt', '-createdAt', 'id'],
    ['lastName', 'firstName']
  ]
});

function yearsSince(date: Date): number {
  const now = new Date();
  let years = now.getUTCFullYear() - date.getUTCFullYear();
  const anniversary = new Date(date);
  anniversary.setUTCFullYear(now.getUTCFullYear());
  if (anniversary > now) {
    years--;
  }
  return Math.max(years, 0);
}
