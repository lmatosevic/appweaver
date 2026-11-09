import fs from 'node:fs';
import path from 'node:path';
import { TSchema, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { parse as parseDotenv } from 'dotenv';
import {
  ConfigSectionDefinition,
  configSections,
  parseArray
} from '@appweaver/common';
import { loadConfigFromFile } from '@appweaver/common/config/config-loader';
import bullmq from '@appweaver/bullmq/module';
import core from '@appweaver/core/modules/core';
import cron from '@appweaver/cron/module';
import data from '@appweaver/data/module';
import handlebars from '@appweaver/handlebars/module';
import nodemailer from '@appweaver/nodemailer/module';
import redis from '@appweaver/redis/module';
import sharp from '@appweaver/sharp/module';
import twilio from '@appweaver/twilio/module';
import web from '@appweaver/web/module';
import { buildConfigSchema } from '../../config/config-schema';

// The example files and the reference of every config key, kept in sync with the sections of the framework modules
const root = path.resolve(__dirname, '../../../..');
const examplePath = path.join(root, 'appweaver.example.json');
const envExamplePath = path.join(root, '.env.example');
const referencePath = path.join(root, 'skill/references/configuration.md');

const modules = [
  core,
  data,
  web,
  redis,
  bullmq,
  cron,
  nodemailer,
  twilio,
  handlebars,
  sharp
];

type Key = {
  name: string;
  property: TSchema;
  section: ConfigSectionDefinition;
};

/** Every flattened key of the sections the framework modules list, with the `app` and `log` sections of common. */
function frameworkKeys(): Map<string, Key> {
  const listed = new Set(modules.flatMap((module) => module.config ?? []));
  const keys = new Map<string, Key>();
  for (const section of configSections.values()) {
    if (
      !listed.has(section.values) &&
      !['app', 'log'].includes(section.section)
    ) {
      continue;
    }
    for (const [key, property] of Object.entries(section.schema.properties)) {
      keys.set(section.prefix + key, { name: key, property, section });
    }
  }
  return keys;
}

const isRecord = (property: TSchema) =>
  property.type === 'object' && property.patternProperties !== undefined;

/** The flattened key a raw name belongs to: its own, or the record key of a record entry (`LOG_LEVELS_DATABASE`). */
function ownerKey(keys: Map<string, Key>, name: string): string | undefined {
  if (keys.has(name)) {
    return name;
  }
  return [...keys.keys()].find(
    (key) => isRecord(keys.get(key)!.property) && name.startsWith(`${key}_`)
  );
}

/** Validates the raw values of every section with its schema, returning the errors by key. */
function sectionErrors(
  keys: Map<string, Key>,
  values: Map<string, unknown>
): string[] {
  const inputs = new Map<ConfigSectionDefinition, Record<string, unknown>>();
  for (const [key, value] of values) {
    const { name, section } = keys.get(key)!;
    const input = inputs.get(section) ?? {};
    input[name] = value;
    inputs.set(section, input);
  }

  const errors: string[] = [];
  for (const [section, input] of inputs) {
    const checked = Value.Convert(
      section.schema,
      Value.Default(section.schema, structuredClone(input))
    );
    for (const error of Value.Errors(section.schema, checked)) {
      errors.push(
        `${section.prefix}${error.path.split('/')[1]}: ${error.message}`
      );
    }
  }
  return errors;
}

describe('config-examples', () => {
  const keys = frameworkKeys();

  test('collects the sections of every framework module', () => {
    expect(keys.has('SERVER_PORT')).toBe(true);
    expect(keys.has('SMS_TWILIO_ACCOUNT_SID')).toBe(true);
    expect(keys.has('SECURITY_ACCOUNT_2FA_METHODS')).toBe(true);
  });

  describe('appweaver.example.json', () => {
    const json = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
    const flattened = loadConfigFromFile(Type.Object({}), examplePath) ?? {};

    test('writes every key in the form of the config schema', () => {
      const schema = buildConfigSchema(
        [...configSections.values()].filter((section) =>
          [...keys.values()].some((key) => key.section === section)
        )
      );

      const unknown: string[] = [];
      const walk = (value: unknown, node: any, at: string) => {
        if (node?.patternProperties || node?.type !== 'object') {
          return;
        }
        for (const [name, child] of Object.entries(value as object)) {
          const property = node.properties?.[name];
          if (!property) {
            unknown.push(`${at}.${name}`);
          } else if (
            child &&
            typeof child === 'object' &&
            !Array.isArray(child)
          ) {
            walk(child, property, `${at}.${name}`);
          }
        }
      };
      walk(json.config, schema.definitions.config, 'config');

      expect(unknown).toEqual([]);
    });

    test('holds only valid values', () => {
      const values = new Map<string, unknown>();
      const unknown: string[] = [];
      for (const [rawKey, value] of Object.entries(flattened)) {
        const name = rawKey.replace(/^_appweaver_/, '');
        const key = ownerKey(keys, name);
        if (!key) {
          unknown.push(name);
        } else if (isRecord(keys.get(key)!.property)) {
          const entry = name.slice(key.length + 1).toLowerCase();
          values.set(key, { ...(values.get(key) as object), [entry]: value });
        } else {
          values.set(key, value);
        }
      }

      expect(unknown).toEqual([]);
      expect(sectionErrors(keys, values)).toEqual([]);
    });
  });

  describe('.env.example', () => {
    const env = parseDotenv(fs.readFileSync(envExamplePath, 'utf8'));

    test('lists every key of the framework', () => {
      // A key mapped from another variable is listed by it, i.e. APP_ENV by NODE_ENV
      const listed = (key: string) =>
        key in env || keys.get(key)!.property.mapFrom !== undefined;

      expect([...keys.keys()].filter((key) => !listed(key))).toEqual([]);
    });

    test('holds only known keys with valid values', () => {
      const values = new Map<string, unknown>();
      const unknown: string[] = [];
      for (const [name, value] of Object.entries(env)) {
        if (name === 'NODE_ENV') {
          continue;
        }
        const key = keys.get(name);
        if (!key) {
          unknown.push(name);
        } else if (value === '') {
          continue;
        } else if (key.property.type === 'array') {
          values.set(name, parseArray(value));
        } else if (key.property.type === 'boolean') {
          values.set(name, ['true', 'on', 'yes', '1'].includes(value));
        } else if (isRecord(key.property)) {
          values.set(
            name,
            Object.fromEntries(parseArray(value).map((pair) => pair.split(':')))
          );
        } else {
          values.set(name, value);
        }
      }

      expect(unknown).toEqual([]);
      expect(sectionErrors(keys, values)).toEqual([]);
    });
  });

  describe('configuration.md', () => {
    const reference = fs.readFileSync(referencePath, 'utf8');

    test('documents every key of the framework', () => {
      expect(
        [...keys.keys()].filter((key) => !reference.includes(`\`${key}\``))
      ).toEqual([]);
    });
  });
});
