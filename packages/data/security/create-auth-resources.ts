import {
  AuthUser,
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
  uncapitalize,
  VirtualConfig,
  ResourceMarks
} from '@appweaver/common';
import { apiKeyConfig } from './auth-config';
import {
  isOAuth2Enabled,
  isTwoFactorEnabled,
  updatePasswordHash
} from './helper';
import { createModel } from '../factory/create-model';
import { createService } from '../factory/create-service';
import {
  CheckOAuth2UserFn,
  RegistrationDataFn,
  RegistrationFilesFn
} from '../types/auth';

/** The fields an auth model adds to the configured ones. */
type AuthFieldName =
  | 'email'
  | 'passwordHash'
  | 'verifiedEmail'
  | 'phone'
  | 'verifiedPhone'
  | 'enabled'
  | 'logoutAt'
  | 'password'
  | 'roles'
  | 'apiKeys'
  | 'twoFactorMethods'
  | 'twoFactorRecoveryCodes';

/**
 * The properties of the auth fields a model config may set. The others keep the email a required unique address the
 * sign-in looks the user up by, and the phone an optional E.164 number the phone verification and the SMS 2FA use.
 */
const overridableProperties: Record<string, string[]> = {
  email: ['hidden', 'redact', 'example', 'minLength', 'maxLength', 'pattern'],
  phone: ['unique', 'hidden', 'redact', 'example']
};

/**
 * Creates the resource model of an authenticatable user, adding the email, password, verification, phone, two-factor
 * method, and role fields to the configured ones. A configured `email` overrides only its `hidden`, `redact`,
 * `example`, `minLength`, `maxLength` and `pattern`, a configured `phone` only its `unique`, `hidden`, `redact` and
 * `example`, and any other auth field replaces a configured one.
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
    // Set by the phone verification or the app code, never by the resource routes, in the E.164 format
    phone: {
      type: 'string',
      required: false,
      maxLength: 16,
      pattern: '^\\+[1-9]\\d{6,14}$'
    },
    verifiedPhone: {
      type: 'boolean',
      default: false
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

  for (const [field, properties] of Object.entries(overridableProperties)) {
    const scalar = config.scalars?.[field];
    if (scalar?.type === 'string') {
      Object.assign(
        authModelScalars[field],
        Object.fromEntries(
          Object.entries(scalar).filter(
            ([key, value]) => properties.includes(key) && value !== undefined
          )
        )
      );
    }
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
    ...(apiKeyConfig.ENABLED
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
    ...(isTwoFactorEnabled()
      ? {
          twoFactorMethods: {
            model: 'TwoFactorMethod',
            type: 'oneToMany',
            mappedBy: uncapitalize(config.name),
            input: {
              type: 'none'
            },
            output: {
              type: 'none'
            }
          },
          twoFactorRecoveryCodes: {
            model: 'TwoFactorRecoveryCode',
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

  const authModelInputOmit = [
    'verifiedEmail',
    'phone',
    'verifiedPhone',
    'logoutAt'
  ];

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
): Ctor<IResourceService<T, T, C, U>> & ResourceMarks {
  // Capture original functions to invoke after new auth logic
  const beforeCreate = config.beforeCreate;
  const beforeUpdate = config.beforeUpdate;

  config.beforeCreate = async (data: C): Promise<void> => {
    await updatePasswordHash(data as AuthUser, passwordOf(data));
    await beforeCreate?.(data);
  };

  config.beforeUpdate = async (id: ResourceId, data: U): Promise<void> => {
    await updatePasswordHash(data as AuthUser, passwordOf(data), true);
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

/** The plain password of the written data of an auth model, which the hook hashes. */
function passwordOf(data: unknown): string | undefined {
  return (data as { password?: string }).password;
}
