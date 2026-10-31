import { CircuitBreaker } from '../circuit-breaker';

describe('circuit-breaker', () => {
  let now: number;
  let onOpen: jest.Mock;
  let onClose: jest.Mock;
  let breaker: CircuitBreaker;

  beforeEach(() => {
    now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    onOpen = jest.fn();
    onClose = jest.fn();
    breaker = new CircuitBreaker(3, 5000, { onOpen, onClose });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const fail = (times: number) => {
    for (let i = 0; i < times; i++) {
      breaker.failure();
    }
  };

  describe('failure', () => {
    test('opens after the threshold of consecutive failures', () => {
      fail(2);
      expect(breaker.isOpen()).toBe(false);

      breaker.failure();

      expect(breaker.isOpen()).toBe(true);
      expect(breaker.acquire()).toBe(false);
      expect(onOpen).toHaveBeenCalledWith(3);
    });

    test('counts only the consecutive failures', () => {
      fail(2);
      breaker.success();
      fail(2);

      expect(breaker.isOpen()).toBe(false);
      expect(onClose).not.toHaveBeenCalled();
    });

    test('never opens with a threshold of 0', () => {
      breaker = new CircuitBreaker(0, 5000, { onOpen });

      fail(10);

      expect(breaker.isOpen()).toBe(false);
      expect(onOpen).not.toHaveBeenCalled();
    });

    test('keeps the breaker open for another cooldown after a failed probe', () => {
      fail(3);
      now += 5000;
      expect(breaker.acquire()).toBe(true);

      breaker.failure();

      expect(breaker.isOpen()).toBe(true);
      expect(breaker.remaining()).toBe(5000);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe('acquire', () => {
    test('allows every call while closed', () => {
      expect(breaker.acquire()).toBe(true);
      expect(breaker.acquire()).toBe(true);
    });

    test('allows one probe once the cooldown elapsed', () => {
      fail(3);
      now += 4999;
      expect(breaker.acquire()).toBe(false);
      expect(breaker.remaining()).toBe(1);

      now += 1;
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.acquire()).toBe(true);
      expect(breaker.acquire()).toBe(false);
    });
  });

  describe('success', () => {
    test('closes an open breaker', () => {
      fail(3);

      breaker.success();

      expect(breaker.isOpen()).toBe(false);
      expect(breaker.remaining()).toBe(0);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('works without listeners', () => {
      breaker = new CircuitBreaker(1, 5000);

      breaker.failure();
      breaker.success();

      expect(breaker.isOpen()).toBe(false);
    });
  });
});
