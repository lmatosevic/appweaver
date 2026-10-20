import { ApplicationContext } from '../types';

export const context: ApplicationContext = {
  resource: {
    models: new Map(),
    services: new Map(),
    policies: new Map(),
    routes: new Map()
  },
  modules: {
    providers: new Map()
  },
  definitions: []
};
