import {
  applyTelemetryConfigurers,
  configureTelemetry,
  TelemetryOptions
} from '../configure-telemetry';

describe('configure-telemetry', () => {
  const options = () =>
    ({
      resourceAttributes: {},
      spanProcessors: []
    }) as unknown as TelemetryOptions;

  test('applies the registered functions in their order', () => {
    const removeFirst = configureTelemetry((value) => {
      value.resourceAttributes.team = 'core';
    });
    const removeSecond = configureTelemetry((value) => {
      value.resourceAttributes.team = `${String(value.resourceAttributes.team)}-platform`;
    });

    const result = applyTelemetryConfigurers(options());

    expect(result.resourceAttributes).toEqual({ team: 'core-platform' });
    removeFirst();
    removeSecond();
  });

  test('no longer applies a removed function', () => {
    const configurer = jest.fn();
    const remove = configureTelemetry(configurer);

    remove();
    remove();
    applyTelemetryConfigurers(options());

    expect(configurer).not.toHaveBeenCalled();
  });
});
