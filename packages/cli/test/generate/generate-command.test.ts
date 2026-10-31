// fkill and prettier are ESM only, and the tests never call them
jest.mock('fkill', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('prettier', () => ({
  __esModule: true,
  default: { format: jest.fn(), resolveConfig: jest.fn() }
}));

import { generateTargets } from '../../generate/generate-command';

describe('generateTargets', () => {
  test('should generate everything without an output flag', () => {
    expect(generateTargets({}, true)).toEqual({
      types: true,
      prismaSchema: true,
      configSchema: true
    });
  });

  test('should generate only the config schema without the data module', () => {
    expect(generateTargets({}, false)).toEqual({
      types: false,
      prismaSchema: false,
      configSchema: true
    });
  });

  test('should leave out the config schema of everything with --no-config-schema', () => {
    expect(generateTargets({ configSchema: false }, true)).toEqual({
      types: true,
      prismaSchema: true,
      configSchema: false
    });
  });

  test('should generate only the config schema with -c, whatever the modules', () => {
    for (const dataEnabled of [true, false]) {
      expect(generateTargets({ configSchema: true }, dataEnabled)).toEqual({
        types: false,
        prismaSchema: false,
        configSchema: true
      });
    }
  });

  test('should generate only the selected outputs', () => {
    expect(generateTargets({ types: true }, true)).toEqual({
      types: true,
      prismaSchema: false,
      configSchema: false
    });
    expect(
      generateTargets({ prismaSchema: true, configSchema: true }, false)
    ).toEqual({ types: false, prismaSchema: true, configSchema: true });
  });
});
