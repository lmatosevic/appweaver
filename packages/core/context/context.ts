import { ApplicationContext } from '../types/application-context';

export const context: ApplicationContext = {
  resource: {
    models: new Map(),
    services: new Map(),
    policies: new Map(),
    routes: new Map()
  },
  modules: {
    enabled: [],
    providers: new Map()
  },
  definitions: []
};
