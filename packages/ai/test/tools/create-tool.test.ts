import { Type } from '@sinclair/typebox';
import { ConfigurationError } from '@appweaver/common';
import { resetContext } from '@appweaver/testing';
import { aiTools, createAiTool, findAiTool } from '../../index';

describe('create-tool', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('createAiTool', () => {
    test('registers the tool under its name', () => {
      const tool = createAiTool({
        name: 'search_docs',
        parameters: Type.Object({ query: Type.String() })
      });

      expect(findAiTool('search_docs')).toBe(tool);
      expect(aiTools()).toEqual([tool]);
      expect(findAiTool('other')).toBeUndefined();
    });

    test('rejects an invalid or a taken name', () => {
      const parameters = Type.Object({});
      createAiTool({ name: 'taken', parameters });

      expect(() => createAiTool({ name: 'taken', parameters })).toThrow(
        "AI tool 'taken' is already defined"
      );
      expect(() => createAiTool({ name: 'has space', parameters })).toThrow(
        ConfigurationError
      );
    });
  });
});
