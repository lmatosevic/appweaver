import { Type } from '@sinclair/typebox';
import { ErrorCode } from '@appweaver/common';
import { resetContext } from '@appweaver/testing';
import {
  createRealtimeAction,
  findRealtimeAction,
  realtimeActions
} from '../action';

describe('action', () => {
  beforeEach(() => {
    resetContext();
  });

  describe('createRealtimeAction', () => {
    test('defines an action in the context', () => {
      const action = createRealtimeAction({
        name: 'chat.typing',
        payload: Type.Object({}),
        handler: () => undefined
      });

      expect(realtimeActions()).toEqual([action]);
      expect(findRealtimeAction('chat.typing')).toBe(action);
      expect(findRealtimeAction('missing')).toBeUndefined();
    });

    test('refuses an invalid name', () => {
      expect(() =>
        createRealtimeAction({
          name: 'bad name',
          payload: Type.Object({}),
          handler: () => undefined
        })
      ).toThrow(
        expect.objectContaining({ code: ErrorCode.ConfigurationInvalid })
      );
    });

    test('refuses a name already taken', () => {
      const config = {
        name: 'ping',
        payload: Type.Object({}),
        handler: () => undefined
      };
      createRealtimeAction(config);

      expect(() => createRealtimeAction(config)).toThrow(/already defined/);
    });
  });
});
