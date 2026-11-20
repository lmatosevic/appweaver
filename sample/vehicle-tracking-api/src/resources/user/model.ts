import { createAuthModel } from '@appweaver/data';

export default createAuthModel({
  name: 'User',
  scalars: {
    firstName: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      example: 'Sarah'
    },
    lastName: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      example: 'Smith'
    },
    email: {
      type: 'string',
      unique: true,
      format: 'email',
      maxLength: 255,
      example: 'sarah@fleet.example.com'
    },
    // The driving licence categories of a driver, i.e. B, C, D
    licenceCategories: {
      type: 'string',
      array: true,
      default: []
    }
  },
  relations: {
    vehicles: {
      model: 'Vehicle',
      type: 'oneToMany',
      mappedBy: 'driver',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none',
        count: true
      }
    },
    trips: {
      model: 'Trip',
      type: 'oneToMany',
      mappedBy: 'driver',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    },
    acknowledgedAlerts: {
      model: 'Alert',
      type: 'oneToMany',
      mappedBy: 'acknowledgedBy',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'none'
      }
    }
  },
  virtual: {
    fullName: {
      type: 'string',
      input: {
        type: 'none'
      },
      output: {
        value: (user: { firstName: string; lastName: string }) =>
          `${user.firstName} ${user.lastName}`
      }
    }
  }
});
