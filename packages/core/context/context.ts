import { ApplicationContext } from '../types';

export const context: ApplicationContext = {
  server: null,
  resource: {
    models: new Map(),
    services: new Map(),
    policies: new Map(),
    routes: new Map()
  },
  definitions: []
};
