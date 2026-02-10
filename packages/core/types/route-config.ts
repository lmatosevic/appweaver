import { ServerInstance } from './server-instance';

export type RouteHandler = (server: ServerInstance) => void;
