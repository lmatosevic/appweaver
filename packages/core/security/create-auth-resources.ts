import {
  RelationConfig,
  RESOURCE_AUTH,
  ResourceModelConfig,
  ResourceServiceConfig,
  ScalarConfig,
  VirtualConfig
} from '@appweaver/common';
import { updatePasswordHash } from './helper';
import { createModel, createService } from '../factory';
import {
  AuthUser,
  IResourceService,
  RegistrationDataFn,
  ResourceModel
} from '../types';

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
    enabled: {
      type: 'boolean',
      default: true
    },
    logoutAt: {
      type: 'dateTime',
      required: false,
      hidden: true
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
    }
  };

  config.scalars = { ...config.scalars, ...authModelScalars };
  config.virtual = { ...config.virtual, ...authModelVirtual };
  config.relations = { ...config.relations, ...authModelRelations };

  const model = createModel(config);

  model[RESOURCE_AUTH] = true;

  return model;
}

export function createAuthService<T = any>(
  config: ResourceServiceConfig & {
    registrationData?: RegistrationDataFn<T>;
  }
): IResourceService {
  // Capture original functions to invoke after new auth logic
  const beforeCreate = config.beforeCreate;
  const beforeUpdate = config.beforeUpdate;

  config.beforeCreate = async (
    data: AuthUser & { password: string }
  ): Promise<void> => {
    await updatePasswordHash(data, data.password);
    await beforeCreate?.(data);
  };

  config.beforeUpdate = async (
    id: number,
    data: AuthUser & { password?: string }
  ): Promise<void> => {
    await updatePasswordHash(data, data.password, true);
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

  const service = createService(config);

  service[RESOURCE_AUTH] = true;

  return service;
}
