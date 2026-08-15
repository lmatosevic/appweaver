import {
  AuthSource,
  AuthUser,
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_TYPE
} from '@appweaver/common';
import { context } from '../../context';
import { HttpError } from '../../errors';
import { ConnectedAccountService } from '../../security/connected-account-service';
import { resetContext } from '../fixtures/context-fixture';

const authUser = { id: 7 } as AuthUser;
const otherUser = { id: 9 } as AuthUser;

let query: jest.Mock;
let create: jest.Mock;
let update: jest.Mock;

/** Registers a User auth model plus a stubbed ConnectedAccount service in the context. */
const registerService = () => {
  context.resource.models.set('User', {
    name: 'User',
    [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE,
    [RESOURCE_AUTH]: true
  } as any);

  query = jest.fn().mockResolvedValue({ items: [] });
  create = jest.fn().mockResolvedValue({ id: 1 });
  update = jest.fn().mockResolvedValue({ id: 1 });

  context.resource.services.set('ConnectedAccount', {
    modelName: 'ConnectedAccount',
    query,
    create,
    update
  } as any);
};

beforeEach(() => {
  resetContext();
});

describe('ConnectedAccountService', () => {
  test('should report itself disabled when the resource is absent', async () => {
    const service = new ConnectedAccountService();

    expect(service.enabled).toBe(false);
    await expect(
      service.find(AuthSource.OAuth2Google, '42')
    ).resolves.toBeNull();
  });

  test('should do nothing on link when the resource is absent', async () => {
    const service = new ConnectedAccountService();

    await expect(
      service.link(authUser, AuthSource.OAuth2Google, '42')
    ).resolves.toBeUndefined();
  });

  test('should create the link on the first sign-in', async () => {
    registerService();
    const service = new ConnectedAccountService();

    expect(service.enabled).toBe(true);

    await service.link(
      authUser,
      AuthSource.OAuth2Google,
      '42',
      'profile email'
    );

    expect(create).toHaveBeenCalledWith({
      provider: AuthSource.OAuth2Google,
      providerAccountId: '42',
      scope: 'profile email',
      lastLoginAt: expect.any(Date),
      user: { id: 7 }
    });
  });

  test('should refresh an existing link instead of duplicating it', async () => {
    registerService();
    query.mockResolvedValue({ items: [{ id: 3, userId: 7 }] });
    const service = new ConnectedAccountService();

    await service.link(authUser, AuthSource.OAuth2Google, '42', 'profile');

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(3, {
      scope: 'profile',
      lastLoginAt: expect.any(Date)
    });
  });

  test('should refuse to move a provider account to another user', async () => {
    registerService();
    query.mockResolvedValue({ items: [{ id: 3, userId: 7 }] });
    const service = new ConnectedAccountService();

    await expect(
      service.link(otherUser, AuthSource.OAuth2Google, '42')
    ).rejects.toThrow('already linked to another user');
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test('should recognise a link that belongs to the user', async () => {
    registerService();
    query.mockResolvedValue({ items: [{ id: 3, userId: 7 }] });
    const service = new ConnectedAccountService();

    await expect(
      service.isLinked(authUser, AuthSource.OAuth2Google, '42')
    ).resolves.toBe(true);
    await expect(
      service.isLinked(otherUser, AuthSource.OAuth2Google, '42')
    ).resolves.toBe(false);
  });

  test('should report an unknown provider account as not linked', async () => {
    registerService();
    const service = new ConnectedAccountService();

    await expect(
      service.isLinked(authUser, AuthSource.OAuth2Google, '42')
    ).resolves.toBe(false);
  });

  test('should wrap lookup failures in an HttpError', async () => {
    registerService();
    query.mockRejectedValue(new Error('connection lost'));
    const service = new ConnectedAccountService();

    await expect(service.find(AuthSource.OAuth2Google, '42')).rejects.toThrow(
      HttpError
    );
  });
});
