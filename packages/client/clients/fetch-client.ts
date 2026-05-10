import { ClientConfig, BaseClient } from './base-client';

export class FetchClient<
  Paths extends {} = { [key: string]: any }
> extends BaseClient<Paths> {
  constructor(config: ClientConfig) {
    super(config);
  }
}
