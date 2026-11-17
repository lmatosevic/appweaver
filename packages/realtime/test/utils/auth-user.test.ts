import { ErrorCode, ResourceError } from '@appweaver/common';

const mockService: { current?: { find: jest.Mock } } = {};
jest.mock('@appweaver/data', () => ({
  ...jest.requireActual('@appweaver/data'),
  resourceAuthService: () => mockService.current
}));

import { loadAuthUser } from '../../utils/auth-user';

describe('auth-user', () => {
  describe('loadAuthUser', () => {
    test('loads the user without the password hash', async () => {
      mockService.current = {
        find: jest.fn().mockResolvedValue({ id: 1, passwordHash: 'hash' })
      };

      await expect(loadAuthUser(1)).resolves.toEqual({ id: 1 });
    });

    test('answers null for a deleted user', async () => {
      mockService.current = {
        find: jest.fn().mockRejectedValue(
          new ResourceError(ErrorCode.ResourceNotFound, 'Not found', {
            model: 'User',
            id: 1
          })
        )
      };

      await expect(loadAuthUser(1)).resolves.toBeNull();
    });

    test('throws any other error', async () => {
      mockService.current = {
        find: jest.fn().mockRejectedValue(new Error('down'))
      };

      await expect(loadAuthUser(1)).rejects.toThrow('down');
    });

    test('answers undefined without an auth model', async () => {
      mockService.current = undefined;

      await expect(loadAuthUser(1)).resolves.toBeUndefined();
    });
  });
});
