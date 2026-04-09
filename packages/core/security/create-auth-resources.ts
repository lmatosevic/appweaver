import {
  AuthUser,
  config as cfg,
  Ctor,
  IResourceService,
  RelationConfig,
  RESOURCE_AUTH,
  ResourceModel,
  ResourceModelConfig,
  ResourceServiceConfig,
  ScalarConfig,
  uncapitalize,
  VirtualConfig
} from '@appweaver/common';
import { updatePasswordHash } from './helper';
import { createModel, createService } from '../factory';
import { RegistrationDataFn } from '../types';

export function createAuthModel(config: ResourceModelConfig): ResourceModel {
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
      array: true,
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
            mappedBy: uncapitalize(config.name),
            array: true,
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

export function createAuthService<T = any, C = any, U = any>(
  config: ResourceServiceConfig<T, C, U> & {
    registrationData?: RegistrationDataFn<T>;
  }
): Ctor<IResourceService<T, T, C, U>> {
  // Capture original functions to invoke after new auth logic
  const beforeCreate = config.beforeCreate;
  const beforeUpdate = config.beforeUpdate;

  config.beforeCreate = async (data: C): Promise<void> => {
    await updatePasswordHash(data as AuthUser, data['password']);
    await beforeCreate?.(data);
  };

  config.beforeUpdate = async (id: number, data: U): Promise<void> => {
    await updatePasswordHash(data as AuthUser, data['password'], true);
    await beforeUpdate?.(id, data);
  };

  if (!config.registrationData) {
    config.registrationData = (_, email, password) => {
      return {
        email,
        password
      } as T;
    };
  }

  const service = createService<T, C, U>(config);

  service[RESOURCE_AUTH] = true;

  return service;
}
