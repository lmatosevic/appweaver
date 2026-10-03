import {
  AuthUser,
  config as cfg,
  Ctor,
  IResourceService,
  ModelName,
  RegistryType,
  RelationConfig,
  RESOURCE_AUTH,
  ResourceModel,
  ResourceId,
  ResourceModelConfig,
  ResourceServiceConfig,
  ScalarConfig,
  ScalarFieldString,
  uncapitalize,
  VirtualConfig
} from '@appweaver/common';
import { isOAuth2Enabled, updatePasswordHash } from './helper';
import { createModel, createService } from '../factory';
import {
  CheckOAuth2UserFn,
  RegistrationDataFn,
  RegistrationFilesFn
} from '../types';

/** The fields an auth model adds to the configured ones. */
type AuthFieldName =
  | 'email'
  | 'passwordHash'
  | 'verifiedEmail'
  | 'twoFactorAuth'
  | 'enabled'
  | 'logoutAt'
  | 'password'
  | 'roles'
  | 'apiKeys';

/**
 * Creates the resource model of an authenticatable user, adding the email, password, verification, two-factor, and
 * role fields to the configured ones.
 *
 * @param {ResourceModelConfig} modelConfig - The model configuration.
 * @return {ResourceModel} The created auth resource model.
 */
export function createAuthModel<
  S extends string,
  R extends string,
  F extends string,
  V extends string
>(modelConfig: ResourceModelConfig<S, R, F, V, AuthFieldName>): ResourceModel {
  const config = modelConfig as ResourceModelConfig;

  const authModelScalars: ScalarConfig = {
    email: {
      type: 'string',
      unique: true,
      maxLength: 255,
      format: 'email'
    },
    passwordHash: {
      type: 'string',
      required: false,
      hidden: true
    },
    verifiedEmail: {
      type: 'boolean',
      default: false
    },
    twoFactorAuth: {
      type: 'enum',
      values: ['None', 'Email'],
      default: 'None'
    },
    enabled: {
      type: 'boolean',
      default: true
    },
    logoutAt: {
      type: 'dateTime',
      required: false
    }
  };

  // Override email properties if already present in the model config
  if (config.scalars?.email?.type === 'string') {
    authModelScalars.email = {
      ...authModelScalars.email,
      ...config.scalars.email
    } as ScalarFieldString;
  }

  const authModelVirtual: VirtualConfig = {
    password: {
      type: 'string',
      required: true,
      input: {
        type: 'all'
      },
      output: {
        type: 'none'
      }
    }
  };

  const authModelRelations: RelationConfig = {
    roles: {
      model: 'Role',
      type: 'manyToMany',
      input: {
        type: 'all'
      },
      output: {
        type: 'always',
        include: {
          permissions: {
            type: 'always'
          }
        }
      }
    },
    ...(cfg.SECURITY_API_KEY_ENABLED
      ? {
          apiKeys: {
            model: 'ApiKey',
            type: 'oneToMany',
            mappedBy: uncapitalize(config.name),
            input: {
              type: 'none'
            },
            output: {
              type: 'none'
            }
          }
        }
      : {}),
    ...(isOAuth2Enabled()
      ? {
          connectedAccounts: {
            model: 'ConnectedAccount',
            type: 'oneToMany',
            mappedBy: uncapitalize(config.name),
            input: {
              type: 'none'
            },
            output: {
              type: 'none'
            }
          }
        }
      : {})
  };

  const authModelInputOmit = ['verifiedEmail', 'logoutAt'];

  config.scalars = { ...config.scalars, ...authModelScalars };
  config.virtual = { ...config.virtual, ...authModelVirtual };
  config.relations = { ...config.relations, ...authModelRelations };

  config.create = {
    ...(config.create ?? {}),
    omit: [...(config.create?.omit ?? []), ...authModelInputOmit]
  };

  config.update = {
    ...(config.update ?? {}),
    omit: [...(config.update?.omit ?? []), ...authModelInputOmit]
  };

  const model = createModel(config);

  model[RESOURCE_AUTH] = true;

  return model;
}

/**
 * Creates the resource service of an authenticatable user, hashing the password on create and update, along with the
 * callbacks preparing the data and files of a registered user. Once the types are generated, the model, create, and
 * update types are inferred from the model name.
 *
 * @param {ResourceServiceConfig} config - The service configuration with the model name, hooks, and registration
 * callbacks.
 * @return {Ctor<IResourceService>} The created service class, defined in the application context.
 */
export function createAuthService<
  N extends ModelName,
  T = RegistryType<N, 'model'>,
  C = RegistryType<N, 'create'>,
  U = RegistryType<N, 'update'>
>(
  config: ResourceServiceConfig<T, C, U> & {
    modelName: N;
    registrationData?: RegistrationDataFn<C>;
    registrationFiles?: RegistrationFilesFn;
    checkOAuth2User?: CheckOAuth2UserFn;
  }
): Ctor<IResourceService<T, T, C, U>> {
  // Capture original functions to invoke after new auth logic
  const beforeCreate = config.beforeCreate;
  const beforeUpdate = config.beforeUpdate;

  config.beforeCreate = async (data: C): Promise<void> => {
    await updatePasswordHash(data as AuthUser, data['password']);
    await beforeCreate?.(data);
  };

  config.beforeUpdate = async (id: ResourceId, data: U): Promise<void> => {
    await updatePasswordHash(data as AuthUser, data['password'], true);
    await beforeUpdate?.(id, data);
  };

  if (!config.registrationData) {
    config.registrationData = (_, email, password) => {
      return {
        email,
        password
      } as C;
    };
  }

  const service = createService<N, T, C, U>(config);

  service[RESOURCE_AUTH] = true;

  return service;
}
