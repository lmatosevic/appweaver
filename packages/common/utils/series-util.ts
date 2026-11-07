import { ResourceModel, ResourceModelConfig, SeriesModel } from '../types';
import { capitalize } from './string-util';
import { idFieldType } from './resource-util';

const DURATION_UNITS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3600,
  d: 86_400,
  w: 604_800
};

/**
 * Parses a duration made of a number and a unit, `ms`, `s`, `m`, `h`, `d` or `w`, into seconds, i.e. `15m` into
 * `900`. A bare number is a number of seconds.
 *
 * @param {string | number} value - The duration, i.e. `1h`.
 * @return {number | undefined} The seconds, or undefined for a value that is not a positive duration.
 */
export function parseDuration(value: string | number): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/);
  if (!match) {
    return undefined;
  }

  const seconds = Number(match[1]) * DURATION_UNITS[match[2] ?? 's'];
  return seconds > 0 ? seconds : undefined;
}

/**
 * Checks if a model declares time series fields.
 *
 * @param {ResourceModelConfig} [config] - The model config.
 * @return {boolean} `true` when the model has at least one `series` field.
 */
export function hasSeries(config?: ResourceModelConfig): boolean {
  return Object.keys(config?.series ?? {}).length > 0;
}

/**
 * The name of the table holding the points of a model: the `tableName` of its series options, `<tableName>_series`
 * for a model with a table name, otherwise `<Model>Series`.
 *
 * @param {ResourceModelConfig} config - The model config.
 * @return {string} The table name.
 */
export function seriesTableName(config: ResourceModelConfig): string {
  return (
    config.seriesOptions?.tableName ??
    (config.tableName
      ? `${config.tableName}_series`
      : `${capitalize(config.name)}Series`)
  );
}

/**
 * Describes the series of a model for a time series store.
 *
 * @param {ResourceModel} model - The resource model, with `series` fields.
 * @return {SeriesModel} The series model.
 */
export function seriesModelOf(model: ResourceModel): SeriesModel {
  return {
    name: model.name,
    table: seriesTableName(model.config),
    idType: idFieldType(model.config.id),
    fields: { ...model.config.series },
    options: { ...model.config.seriesOptions }
  };
}
