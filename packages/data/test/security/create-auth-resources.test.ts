import { createAuthModel } from '@appweaver/data';
import { resetContext } from '@appweaver/testing';

describe('createAuthModel', () => {
  afterEach(() => {
    resetContext();
  });

  test('adds an optional E.164 phone the resource routes never write', () => {
    const model: any = createAuthModel({ name: 'User' });

    expect(model.config.scalars.phone).toEqual({
      type: 'string',
      required: false,
      maxLength: 16,
      pattern: '^\\+[1-9]\\d{6,14}$'
    });
    expect(model.config.create.omit).toContain('phone');
    expect(model.config.update.omit).toContain('phone');
  });

  test('overrides only the hidden, example, lengths and pattern of a configured email', () => {
    const model: any = createAuthModel({
      name: 'User',
      scalars: {
        email: {
          type: 'string',
          required: false,
          unique: false,
          hidden: true,
          minLength: 6,
          maxLength: 120,
          format: 'uri',
          pattern: '^[^@]+@acme\\.com$',
          default: 'nobody@acme.com',
          example: 'user@acme.com'
        }
      }
    });

    expect(model.config.scalars.email).toEqual({
      type: 'string',
      unique: true,
      hidden: true,
      minLength: 6,
      maxLength: 120,
      format: 'email',
      pattern: '^[^@]+@acme\\.com$',
      example: 'user@acme.com'
    });
  });

  test('replaces a configured email of another type', () => {
    const model: any = createAuthModel({
      name: 'User',
      scalars: { email: { type: 'int', unique: false } }
    });

    expect(model.config.scalars.email).toEqual({
      type: 'string',
      unique: true,
      maxLength: 255,
      format: 'email'
    });
  });

  test('overrides only the unique, hidden and example of a configured phone', () => {
    const model: any = createAuthModel({
      name: 'User',
      scalars: {
        phone: {
          type: 'string',
          required: true,
          unique: true,
          hidden: true,
          maxLength: 32,
          pattern: '^\\d+$',
          example: '+15035550123'
        }
      }
    });

    expect(model.config.scalars.phone).toEqual({
      type: 'string',
      required: false,
      unique: true,
      hidden: true,
      maxLength: 16,
      pattern: '^\\+[1-9]\\d{6,14}$',
      example: '+15035550123'
    });
    expect(model.config.update.omit).toContain('phone');
  });

  test('replaces a configured phone of another type', () => {
    const model: any = createAuthModel({
      name: 'User',
      scalars: { phone: { type: 'int', unique: true } }
    });

    expect(model.config.scalars.phone).toEqual({
      type: 'string',
      required: false,
      maxLength: 16,
      pattern: '^\\+[1-9]\\d{6,14}$'
    });
  });
});
