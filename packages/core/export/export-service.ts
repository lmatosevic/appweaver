import { Readable } from 'node:stream';
import {
  config,
  ExportConfig,
  extractResourceName,
  extractSchemaProperties,
  isArray,
  isCountField,
  isFunction,
  isPlainObject,
  isString,
  logger,
  plural,
  QueryResponse,
  QuerySort
} from '@appweaver/common';
import { injectModel, injectService } from '../context';
import { HttpError } from '../errors';
import { generateFileName, toCsv } from '../utils';

export type ExportStream = {
  stream: Readable;
  fileName: string;
  mimeType: string;
};

export class ExportService {
  /**
   * Exports data as a CSV stream based on the provided filter and sort parameters.
   * The records are read batch by batch, each following the cursor of the
   * previous one, so the export never counts the records up front.
   *
   * @param {string} modelName - The resource name for which to export data.
   * @param {Object} [filter={}] - The filter conditions to apply when retrieving the data. Default is an empty object.
   * @param {QuerySort} [sort='-createdAt'] - The sorting criteria for the data, given either as a comma-separated
   * field list or as an object of field directions.
   * @return {Promise<ExportStream>} A promise resolving to the export stream object, which includes the readable
   * stream, MIME type, and file name for the CSV.
   */
  public async exportCsv(
    modelName: string,
    filter: any = {},
    sort: QuerySort = '-createdAt'
  ): Promise<ExportStream> {
    const service = injectService(modelName);

    let exportStream: Readable;
    try {
      const batchSize = config.EXPORT_BATCH_SIZE;

      const mapValues = (items: any[]) => this.mapProperties(modelName, items);
      const readBatch = (cursor?: string | null) =>
        service.query(filter, 1, batchSize, sort, cursor, false);

      // Read before the stream is handed out, so a failing query becomes an
      // error response instead of a truncated download
      const firstBatch = await readBatch();

      // A generator rather than a `read` callback, which the stream may re-enter
      // while an awaited batch is pending and would then write it twice
      async function* rows(): AsyncGenerator<string> {
        if (config.EXPORT_CSV_ADD_SEP_ROW) {
          yield `SEP=${config.EXPORT_CSV_DELIMITER}\n`;
        }

        let batch: QueryResponse<any> | undefined = firstBatch;
        let addHeaders = config.EXPORT_CSV_ADD_HEADERS;

        while (batch) {
          let chunk: string | undefined;
          let next: QueryResponse<any> | undefined;

          try {
            if (batch.resultCount > 0) {
              chunk = toCsv(mapValues(batch.items), addHeaders);
              addHeaders = false;
            }

            // A next cursor is returned only while further records match
            next = batch.nextCursor
              ? await readBatch(batch.nextCursor)
              : undefined;
          } catch (e) {
            // End early rather than fail a download already in flight
            logger.error(e, `${modelName} export error`);
            next = undefined;
          }

          if (chunk !== undefined) {
            yield chunk;
          }
          batch = next;
        }
      }

      exportStream = Readable.from(rows(), { objectMode: false });
    } catch (e) {
      throw new HttpError(`${modelName} export error`, 500, e);
    }

    const fileName = this.generateExportFileName(modelName, 'csv');

    logger.debug({ modelName, filter, fileName }, 'CSV File export');

    return { stream: exportStream, mimeType: 'text/csv', fileName };
  }

  /** @internal */
  private mapProperties(resourceName: string, items: any[]): any[] {
    const properties: any[] = [];

    for (const item of items) {
      const property = this.mapProperty(resourceName, item);
      properties.push(property);
    }

    return properties;
  }

  /** @internal */
  private mapProperty(
    resourceName: string,
    item: any,
    resourceExportConfig?: ExportConfig,
    parentKey: string = ''
  ): any {
    const resourceModel = injectModel(resourceName);
    const readModel = resourceModel.readModel;
    const relationsModel = resourceModel.relationsModel;
    const filesModel = resourceModel.filesModel;
    const exportConfig = resourceExportConfig ?? resourceModel.config.export;

    const property = {};

    for (const key in item) {
      let value = item[key];

      const modelSchema = extractSchemaProperties(readModel, key);
      const relationSchema = extractSchemaProperties(relationsModel, key);
      const fileSchema = extractSchemaProperties(filesModel, key);
      if (
        !modelSchema &&
        !relationSchema &&
        !fileSchema &&
        !isCountField(key)
      ) {
        // Skip mapping for non-exposed fields.
        continue;
      }

      let header = parentKey ? `${parentKey}.${key}` : key;

      const isArrayValue = isArray(value);

      const exportField = exportConfig?.[key];
      if (exportField) {
        if (exportField.exclude === true) {
          // Skip mapping for excluded fields.
          continue;
        }

        if (isString(exportField.headerName)) {
          header = parentKey
            ? `${parentKey}.${exportField.headerName}`
            : exportField.headerName;
        }

        const mapValue = exportField.mapValue;
        if (mapValue) {
          // A scalar value has no properties to read the configured field name
          // off, so it is resolved against the exported record itself.
          if (isString(mapValue) && !relationSchema && !fileSchema) {
            value = item?.[mapValue];
          } else {
            const mappedValues: string[] = [];

            // Transform value items using mapValue configuration.
            const subItems = isArrayValue ? value : [value];
            for (const subItem of subItems) {
              if (isFunction(mapValue)) {
                try {
                  mappedValues.push(mapValue(subItem));
                } catch (e) {
                  mappedValues.push('');
                  logger.error(e, 'Export value mapping error.');
                }
              } else if (isString(mapValue)) {
                mappedValues.push(subItem?.[mapValue]);
              }
            }

            value = mappedValues.join(',');
          }
        }
      }

      // Recursively map relation and file fields if the value is an object.
      // Arrays of plain values are written as a single column below.
      if (isPlainObject(value) || (isArrayValue && isPlainObject(value[0]))) {
        const relationName = extractResourceName(relationSchema ?? fileSchema);
        if (!relationName) {
          continue;
        }

        const subItems = isArrayValue ? value : [value];
        for (const subItem of subItems) {
          const mappedItem = this.mapProperty(
            relationName,
            subItem,
            exportField,
            header
          );
          for (const subKey in mappedItem) {
            if (subKey in property) {
              property[subKey] = [property[subKey], mappedItem[subKey]].join(
                config.EXPORT_CSV_JOIN_DELIMITER
              );
            } else {
              property[subKey] = mappedItem[subKey];
            }
          }
        }
      } else {
        property[header] = value;
      }
    }

    return property;
  }

  /** @internal */
  private generateExportFileName(modelName: string, extension: string): string {
    return generateFileName(
      `${plural(modelName)}.${extension}`,
      '{name}_{year}{month}{day}_{hours}{minutes}{seconds}.{extension}'
    );
  }
}
