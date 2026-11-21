import { createModel } from '../../../factory/create-model';
import { auditConfig } from '../../audit-config';

const shouldCreateModel =
  auditConfig.ENABLED || auditConfig.KEEP_DATABASE_TABLE;

// Written by the AuditService with its audit log entry, exposed like it by the application
export default shouldCreateModel
  ? createModel({
      name: 'AuditChange',
      id: {
        type: 'string',
        generator: 'uuid(7)'
      },
      audit: {
        updatedAt: false,
        createdById: false
      },
      scalars: {
        model: { type: 'string', maxLength: 255 },
        resourceId: { type: 'string', maxLength: 255 },
        action: { type: 'string', maxLength: 16 },
        // The changed fields, `{ field: { from, to } }`
        diff: { type: 'json' }
      },
      relations: {
        auditLog: {
          model: 'AuditLog',
          type: 'manyToOne',
          mappedBy: 'changes',
          // Deleted with their entry when its retention expires
          onDelete: 'cascade',
          input: {
            type: 'none'
          },
          // The request, the user and the client of the change
          output: {
            type: 'always'
          }
        }
      },
      index: [['model', 'resourceId', '-createdAt']]
    })
  : undefined;
