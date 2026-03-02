import { Memory } from './memory';

export abstract class Redis<Options = any, Client = any> extends Memory {
  abstract createClient(extraOptions?: Options): Client;
}
