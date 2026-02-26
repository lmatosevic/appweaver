import { ApplicationContext } from '../types';

export const context: ApplicationContext = {
  server: null,
  resource: {
    models: {},
    services: {},
    policies: {},
    routes: {}
  },
  definitions: []
};
