import {
  isArray,
  isBoolean,
  isConstructor,
  isFunction,
  isHealthCheck,
  isLifecycleDestroy,
  isLifecycleInit,
  isNumber,
  isObject,
  isString,
  isSymbol,
  resolveDatabaseType
} from '../../utils/type-util';
import { HEALTH_CHECK, LIFECYCLE } from '../../constants';
import { DatabaseType } from '../../enums';

class HealthyService {
  static [HEALTH_CHECK] = true;

  checkHealth() {
    return { status: 'up' };
  }
}

class UntaggedHealthService {
  checkHealth() {
    return { status: 'up' };
  }
}

class TaggedWithoutMethod {
  static [HEALTH_CHECK] = true;
}

class LifecycleService {
  static [LIFECYCLE] = true;

  async onInit() {
    /* noop */
  }

  async onDestroy() {
    /* noop */
  }
}

class InitOnlyService {
  static [LIFECYCLE] = true;

  async onInit() {
    /* noop */
  }
}

describe('type-util', () => {
  describe('isArray', () => {
    test('returns true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2])).toBe(true);
    });

    test('returns false for non arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('abc')).toBe(false);
      expect(isArray(null)).toBe(false);
      expect(isArray(undefined)).toBe(false);
      expect(isArray(new Set([1]))).toBe(false);
    });
  });

  describe('isObject', () => {
    test('returns true for objects, arrays and null', () => {
      expect(isObject({})).toBe(true);
      expect(isObject([])).toBe(true);
      expect(isObject(new Date())).toBe(true);
      // typeof null === 'object'
      expect(isObject(null)).toBe(true);
    });

    test('returns false for primitives and functions', () => {
      expect(isObject('abc')).toBe(false);
      expect(isObject(1)).toBe(false);
      expect(isObject(true)).toBe(false);
      expect(isObject(undefined)).toBe(false);
      expect(isObject(() => undefined)).toBe(false);
    });
  });

  describe('isFunction', () => {
    test('returns true for functions, arrow functions and classes', () => {
      expect(isFunction(function named() {})).toBe(true);
      expect(isFunction(() => undefined)).toBe(true);
      expect(isFunction(HealthyService)).toBe(true);
    });

    test('returns false for non functions', () => {
      expect(isFunction({})).toBe(false);
      expect(isFunction('abc')).toBe(false);
      expect(isFunction(null)).toBe(false);
    });
  });

  describe('isNumber', () => {
    test('returns true for finite numbers', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(-1.5)).toBe(true);
      expect(isNumber(Infinity)).toBe(true);
    });

    test('returns false for NaN and non numbers', () => {
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber('1')).toBe(false);
      expect(isNumber(null)).toBe(false);
      expect(isNumber(undefined)).toBe(false);
      expect(isNumber(1n)).toBe(false);
    });
  });

  describe('isString', () => {
    test('returns true for strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('abc')).toBe(true);
    });

    test('returns false for non strings', () => {
      expect(isString(1)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(['a'])).toBe(false);
    });
  });

  describe('isSymbol', () => {
    test('returns true for symbols', () => {
      expect(isSymbol(Symbol('x'))).toBe(true);
      expect(isSymbol(HEALTH_CHECK)).toBe(true);
    });

    test('returns false for non symbols', () => {
      expect(isSymbol('x')).toBe(false);
      expect(isSymbol(null)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    test('returns true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    test('returns false for truthy or falsy non booleans', () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
    });
  });

  describe('isConstructor', () => {
    test('returns true for classes and function constructors', () => {
      expect(isConstructor(HealthyService)).toBe(true);
      expect(isConstructor(function Legacy() {})).toBe(true);
    });

    test('returns false for arrow functions and instances', () => {
      expect(isConstructor(() => undefined)).toBe(false);
      expect(isConstructor(new HealthyService())).toBe(false);
      expect(isConstructor({})).toBe(false);
    });
  });

  describe('isHealthCheck', () => {
    test('returns true for a tagged instance', () => {
      expect(isHealthCheck(new HealthyService())).toBe(true);
    });

    test('returns true for a tagged class', () => {
      expect(isHealthCheck(HealthyService)).toBe(true);
    });

    test('returns true for a plain object carrying the tag', () => {
      expect(
        isHealthCheck({ [HEALTH_CHECK]: true, checkHealth: () => undefined })
      ).toBe(true);
    });

    test('returns false when the tag is missing', () => {
      expect(isHealthCheck(new UntaggedHealthService())).toBeFalsy();
    });

    test('returns false when the method is missing', () => {
      expect(isHealthCheck(new TaggedWithoutMethod())).toBeFalsy();
    });

    test('returns false for unrelated values', () => {
      expect(isHealthCheck({})).toBeFalsy();
    });
  });

  describe('isLifecycleInit', () => {
    test('returns true for a tagged instance exposing onInit', () => {
      expect(isLifecycleInit(new LifecycleService())).toBe(true);
      expect(isLifecycleInit(new InitOnlyService())).toBe(true);
    });

    test('returns true for a tagged class', () => {
      expect(isLifecycleInit(LifecycleService)).toBe(true);
    });

    test('returns false when onInit is missing', () => {
      expect(isLifecycleInit(new TaggedWithoutMethod())).toBeFalsy();
    });

    test('returns false when the tag is missing', () => {
      expect(isLifecycleInit({ onInit: () => undefined })).toBeFalsy();
    });
  });

  describe('isLifecycleDestroy', () => {
    test('returns true for a tagged instance exposing onDestroy', () => {
      expect(isLifecycleDestroy(new LifecycleService())).toBe(true);
    });

    test('returns false when only onInit is implemented', () => {
      expect(isLifecycleDestroy(new InitOnlyService())).toBeFalsy();
    });

    test('returns false when the tag is missing', () => {
      expect(isLifecycleDestroy({ onDestroy: () => undefined })).toBeFalsy();
    });
  });

  describe('resolveDatabaseType', () => {
    test('returns the explicit type when provided', () => {
      expect(
        resolveDatabaseType(DatabaseType.MySQL, 'postgresql://localhost')
      ).toBe(DatabaseType.MySQL);
    });

    test('infers postgresql from the url', () => {
      expect(
        resolveDatabaseType(undefined, 'postgresql://user:pass@host:5432/db')
      ).toBe(DatabaseType.PostgresSQL);
    });

    test('infers mysql from mysql and mariadb urls', () => {
      expect(resolveDatabaseType(undefined, 'mysql://host/db')).toBe(
        DatabaseType.MySQL
      );
      expect(resolveDatabaseType(undefined, 'mariadb://host/db')).toBe(
        DatabaseType.MySQL
      );
    });

    test('infers sqlserver from the url', () => {
      expect(
        resolveDatabaseType(undefined, 'sqlserver://host;database=db')
      ).toBe(DatabaseType.SQLServer);
    });

    test('falls back to sqlite', () => {
      expect(resolveDatabaseType()).toBe(DatabaseType.Sqlite);
      expect(resolveDatabaseType(undefined, 'file:./dev.db')).toBe(
        DatabaseType.Sqlite
      );
      expect(resolveDatabaseType(undefined, 'unknown://host')).toBe(
        DatabaseType.Sqlite
      );
    });
  });
});
