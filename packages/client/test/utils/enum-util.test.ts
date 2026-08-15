import { rewriteEnumsAsObjects } from '../../utils/enum-util';

describe('enum-util', () => {
  describe('rewriteEnumsAsObjects', () => {
    test('rewrites an enum into a constant object and a type alias', () => {
      const content =
        'export enum SortDirection {\n    asc = "asc",\n    desc = "desc"\n}';

      expect(rewriteEnumsAsObjects(content)).toBe(
        'export const SortDirection = {\n' +
          '    asc: "asc",\n' +
          '    desc: "desc",\n' +
          '} as const;\n' +
          'export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];'
      );
    });

    test('declares the object without a value for a declaration file', () => {
      const content = 'export enum Status {\n    up = "up"\n}';

      expect(rewriteEnumsAsObjects(content, true)).toBe(
        'export declare const Status: {\n' +
          '    readonly up: "up";\n' +
          '};\n' +
          'export type Status = (typeof Status)[keyof typeof Status];'
      );
    });

    test('rewrites every enum of the content', () => {
      const content =
        'export enum A {\n    a = "a"\n}\nexport type X = A;\nexport enum B {\n    b = 1\n}';
      const rewritten = rewriteEnumsAsObjects(content);

      expect(rewritten).toContain(
        'export const A = {\n    a: "a",\n} as const;'
      );
      expect(rewritten).toContain('export const B = {\n    b: 1,\n} as const;');
      expect(rewritten).toContain('export type X = A;');
      expect(rewritten).not.toContain('export enum');
    });

    test('keeps quoted member names and values holding a comma', () => {
      const content = 'export enum Odd {\n    "a-b" = "a,b"\n}';

      expect(rewriteEnumsAsObjects(content)).toContain(
        'export const Odd = {\n    "a-b": "a,b",\n} as const;'
      );
    });

    test('leaves an enum without members unchanged', () => {
      expect(rewriteEnumsAsObjects('export enum Empty {\n}')).toBe(
        'export enum Empty {\n}'
      );
    });

    test('leaves content without enums unchanged', () => {
      expect(rewriteEnumsAsObjects('export type A = string;')).toBe(
        'export type A = string;'
      );
    });
  });
});
