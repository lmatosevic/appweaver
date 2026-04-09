import { Readable } from 'node:stream';
import {
  config,
  ExportConfig,
  ExportRelations,
  extractResourceName,
  extractSchemaProperties,
  isArray,
  isCountField,
  isFunction,
  isObject,
  isString,
  logger,
  plural
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
   * The method retrieves the data in batches and streams it in CSV format.
   *
   * @param {string} modelName - The resource name for which to export data.
   * @param {Object} [filter={}] - The filter conditions to apply when retrieving the data. Default is an empty object.
   * @param {string} [sort='-createdAt,id'] - The sorting criteria for the data. Default is `-createdAt, id`.
   * @return {Promise<ExportStream>} A promise resolving to the export stream object, which includes the readable
   * stream, MIME type, and file name for the CSV.
   */
  public async exportCsv(
    modelName: string,
    filter: any = {},
    sort: string = '-createdAt,id'
  ): Promise<ExportStream> {
    const service = injectService(modelName);

    let exportStream: Readable;
    try {
      // Initial query is also useful to expose any errors before stream start.
      const checkResult = await service.query(filter, 1, 0, sort);
      const totalCount = checkResult.totalCount;

      const batchSize = config.EXPORT_BATCH_SIZE;
      let page = 0;

      const mapValues = (items: any[]) => this.mapProperties(modelName, items);

      exportStream = new Readable({
        async read() {
          page++;

          try {
            const result = await service.query(filter, page, batchSize, sort);
            if (result.resultCount > 0) {
              const data = mapValues(result.items);
              this.push(
                toCsv(data, config.EXPORT_CSV_ADD_HEADERS ? page === 1 : false)
              );
            }
          } catch (e) {
            logger.error(e, `${modelName} export error`);
            this.push(null);
            return;
          }

          if (page * batchSize >= totalCount) {
            this.push(null);
          }
        }
      });

      if (config.EXPORT_CSV_ADD_SEP_ROW) {
        exportStream.push(`SEP=${config.EXPORT_CSV_DELIMITER}\n`);
      }
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

        if (exportField.mapValue) {
          const mappedValues: string[] = [];

          // Transform value items using mapValue configuration.
          const subItems = isArrayValue ? value : [value];
          for (const subItem of subItems) {
            if (isFunction(exportField.mapValue)) {
              try {
                mappedValues.push(exportField.mapValue(subItem));
              } catch (e) {
                mappedValues.push('');
                logger.error(e, 'Export value mapping error.');
              }
            } else if (!isObject(exportField.mapValue)) {
              mappedValues.push(subItem?.[exportField.mapValue]);
            }
          }

          value = mappedValues.join(',');
        }
      }

      // Recursively map relation and file fields if the value is an object.
      if ((value && isObject(value)) || (isArrayValue && isObject(value[0]))) {
        const relationName = extractResourceName(relationSchema ?? fileSchema);
        if (!relationName) {
          continue;
        }

        const subItems = isArrayValue ? value : [value];
        for (const subItem of subItems) {
          const mappedItem = this.mapProperty(
            relationName,
            subItem,
            exportField as ExportRelations,
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
