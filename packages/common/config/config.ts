import { Type } from '@sinclair/typebox';
import { loadConfigFromEnv, loadConfigFromFiles } from './config-loader';
import { ConfigHelper, createConfigHelper } from './config-helper';
import { readConfig, setRawConfig } from './define-config';

// Every value is read without a schema, so each one is kept raw under its
// prefixed key, and parsed by the section declaring it on its first access
const { config: envConfig, files: envFiles } = loadConfigFromEnv(
  Type.Object({})
);
const { config: jsonConfig, files: jsonFiles } = loadConfigFromFiles(
  Type.Object({})
);

setRawConfig(jsonConfig, envConfig);

/** The files the config was loaded from. */
const configFiles = envFiles.concat(jsonFiles);

/**
 * The typed accessors of any config key by its flattened name (`config.int('SERVER_PORT')`), including the keys no
 * section declares. The sections of `defineConfig` give the typed values of the declared keys.
 */
const config: ConfigHelper = Object.freeze(createConfigHelper(readConfig));

export { config, configFiles };
