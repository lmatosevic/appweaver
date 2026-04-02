## [1.8.0](https://gitlab.com/app-weaver/appweaver/compare/v1.7.17...v1.8.0) (2026-04-02)

### Features

* implement support for scanning and loading modules from any application directory structures, restructure config variables and utility functions ([8fafc6a](https://gitlab.com/app-weaver/appweaver/commit/8fafc6a6dab7698edc2cbfc3d2bf7a9b88c2ecb2))

### Bug Fixes

* add `CACHE_MAX_SIZE_BYTES` support, improve cache eviction logic and update defaults ([60d50e0](https://gitlab.com/app-weaver/appweaver/commit/60d50e0600951ddd6733cb1d72d254236e8d0d3b))
* add `valueSizeBytes` method to memory adapters, unify eviction API, and improve cache metadata handling ([c9c16f6](https://gitlab.com/app-weaver/appweaver/commit/c9c16f647856560613087ff721c1ad7bec25aebe))
* add TSDocs for common types, enhance factory functions typing with generics, and improve type safety across services ([db92242](https://gitlab.com/app-weaver/appweaver/commit/db92242e7b5f639d2768b51cbab70ec882003cf5))
* clean up legacy changelog sections, update skill configuration file, update config comments and default values ([7cb12b7](https://gitlab.com/app-weaver/appweaver/commit/7cb12b74dde01f43f71ee2a82d8b4f3ca5baf653))
* extend health check configuration, add pick/omit instances support, update skill mailer referenced document ([2c8669a](https://gitlab.com/app-weaver/appweaver/commit/2c8669a9ec3bb0ae24cb2368b8eda7fcf5842620))
