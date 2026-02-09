import { Readable } from 'node:stream';
import {
  config,
  ExportConfig,
  ExportRelations,
  isArray,
  isObject,
  logger,
  plural
} from '@appweaver/common';
import { context } from '../context';
import { HttpError } from '../errors';
import { ResourceService } from '../resource';
import {
  extractResourceName,
  generateFileName,
  isCountField,
  toCsv
} from '../utils';

export type ExportStream = {
  stream: Readable;
  fileName: string;
  mimeType: string;
};

export class ExportService {
  public async exportCsv(
    service: ResourceService<any>,
    filter: any = {},
    sort: string = '-createdAt,id'
  ): Promise<ExportStream> {
    let exportStream: Readable;
    try {
      // Initial query is also useful to expose any errors before stream start.
      const checkResult = await service.query(filter, 1, 0, sort);
      const totalCount = checkResult.totalCount;

      const batchSize = config.EXPORT_BATCH_SIZE;
      let page = 0;

      const mapValues = (items: any[]) =>
        this.mapProperties(service.model.name, items);

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
            logger.error(e, `${service.model.name} export error`);
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
      throw new HttpError(`${service.model.name} export error`, 500, e);
    }

    const fileName = this.generateExportFileName(service.model.name, 'csv');

    return { stream: exportStream, mimeType: 'text/csv', fileName };
  }

  private mapProperties(resourceName: string, items: any[]): any[] {
    const properties: any[] = [];

    for (const item of items) {
      const property = this.mapProperty(resourceName, item);
      properties.push(property);
    }

    return properties;
  }

  private mapProperty(
    resourceName: string,
    item: any,
    resourceExportConfig?: ExportConfig,
    parentKey: string = ''
  ): any {
    const resourceModel = context.models[resourceName];
    const readModel = resourceModel?.readModel;
    const relationModel = resourceModel?.relationsModel;
    const fileModel = resourceModel?.filesModel;
    const exportConfig = resourceExportConfig ?? resourceModel?.config.export;

    const property = {};

    for (const key in item) {
      let value = item[key];

      const modelSchema = readModel?.properties[key];
      const relationSchema = relationModel?.properties[key];
      const fileSchema = fileModel?.properties[key];
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

        if (typeof exportField.headerName === 'string') {
          header = parentKey
            ? `${parentKey}.${exportField.headerName}`
            : exportField.headerName;
        }

        if (exportField.mapValue) {
          const mappedValues: string[] = [];

          // Transform value items using mapValue configuration.
          const subItems = isArrayValue ? value : [value];
          for (const subItem of subItems) {
            if (typeof exportField.mapValue === 'function') {
              try {
                mappedValues.push(exportField.mapValue(subItem));
              } catch (e) {
                mappedValues.push('');
                logger.error(e, 'Export value mapping error.');
              }
            } else if (typeof exportField.mapValue !== 'object') {
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

  private generateExportFileName(modelName: string, extension: string): string {
    return generateFileName(
      `${plural(modelName)}.${extension}`,
      '{name}_{year}{month}{day}_{hours}{minutes}{seconds}.{extension}'
    );
  }
}

const exportService = new ExportService();

export { exportService };
