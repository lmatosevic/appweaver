import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const exportConfig = defineConfig('export', {
  /** Number of records per batch during export. Default: `1000`. */
  BATCH_SIZE: Type.Integer({ default: 1000 }),
  /** CSV field delimiter character. Default: `';'`. */
  CSV_DELIMITER: Type.String({ default: ';' }),
  /** Delimiter for joining array values in CSV cells. Default: `','`. */
  CSV_JOIN_DELIMITER: Type.String({ default: ',' }),
  /** Include a header row in CSV exports. Default: `true`. */
  CSV_ADD_HEADERS: Type.Boolean({ default: true }),
  /** Add a separator row (BOM) for Excel compatibility. Default: `false`. */
  CSV_ADD_SEP_ROW: Type.Boolean({ default: false })
});
