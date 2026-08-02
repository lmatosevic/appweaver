import { NodeEvents } from '../../events/node-events';

describe('node-events', () => {
  let events: NodeEvents;

  beforeEach(() => {
    events = new NodeEvents();
  });

  afterEach(() => {
    events.removeAllListeners();
  });

  describe('onResourceEvent / emitResourceEvent', () => {
    test('calls the listener registered for the resource event', () => {
      const listener = jest.fn();
      events.onResourceEvent('Post', 'create', listener);

      const emitted = events.emitResourceEvent('Post', 'create', {
        current: { id: 1 }
      });

      expect(emitted).toBe(true);
      expect(listener).toHaveBeenCalledWith({ current: { id: 1 } });
    });

    test('returns a listener id', () => {
      expect(typeof events.onResourceEvent('Post', 'create', jest.fn())).toBe(
        'string'
      );
    });

    test('calls every listener of the same event', () => {
      const first = jest.fn();
      const second = jest.fn();
      events.onResourceEvent('Post', 'create', first);
      events.onResourceEvent('Post', 'create', second);

      events.emitResourceEvent('Post', 'create', { current: { id: 1 } });

      expect(first).toHaveBeenCalled();
      expect(second).toHaveBeenCalled();
    });

    test('does not call listeners of other events', () => {
      const createListener = jest.fn();
      const updateListener = jest.fn();
      events.onResourceEvent('Post', 'create', createListener);
      events.onResourceEvent('Post', 'update', updateListener);

      events.emitResourceEvent('Post', 'create', { current: { id: 1 } });

      expect(createListener).toHaveBeenCalled();
      expect(updateListener).not.toHaveBeenCalled();
    });

    test('does not call listeners of other resources', () => {
      const listener = jest.fn();
      events.onResourceEvent('User', 'create', listener);

      events.emitResourceEvent('Post', 'create', { current: { id: 1 } });

      expect(listener).not.toHaveBeenCalled();
    });

    test('reports that nothing listened to the event', () => {
      expect(
        events.emitResourceEvent('Post', 'create', { current: { id: 1 } })
      ).toBe(false);
    });

    test('passes the previous and current data to the listener', () => {
      const listener = jest.fn();
      events.onResourceEvent('Post', 'update', listener);

      events.emitResourceEvent('Post', 'update', {
        previous: { id: 1, title: 'Old' },
        current: { id: 1, title: 'New' }
      });

      expect(listener).toHaveBeenCalledWith({
        previous: { id: 1, title: 'Old' },
        current: { id: 1, title: 'New' }
      });
    });
  });

  describe('removeResourceEvent', () => {
    test('removes a registered listener', () => {
      const listener = jest.fn();
      const id = events.onResourceEvent('Post', 'create', listener);

      expect(events.removeResourceEvent(id)).toBe(true);

      events.emitResourceEvent('Post', 'create', { current: { id: 1 } });
      expect(listener).not.toHaveBeenCalled();
    });

    test('keeps the other listeners registered', () => {
      const removed = jest.fn();
      const kept = jest.fn();
      const id = events.onResourceEvent('Post', 'create', removed);
      events.onResourceEvent('Post', 'create', kept);

      events.removeResourceEvent(id);
      events.emitResourceEvent('Post', 'create', { current: { id: 1 } });

      expect(removed).not.toHaveBeenCalled();
      expect(kept).toHaveBeenCalled();
    });

    test('returns false for an unknown listener id', () => {
      expect(events.removeResourceEvent('missing')).toBe(false);
    });

    test('returns false when removing the same listener twice', () => {
      const id = events.onResourceEvent('Post', 'create', jest.fn());

      expect(events.removeResourceEvent(id)).toBe(true);
      expect(events.removeResourceEvent(id)).toBe(false);
    });
  });

  describe('error handling', () => {
    test('registers an error listener so emitted errors do not crash', () => {
      expect(events.listenerCount('error')).toBe(1);
      expect(() => events.emit('error', new Error('boom'))).not.toThrow();
    });
  });
});
