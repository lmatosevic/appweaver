import { createRoutes } from '@appweaver/core';
import { Permission } from '@/features/access/permissions';

// Employees read their own documents, only HR files them
export default createRoutes({
  modelName: 'EmployeeDocument',
  path: '/documents',
  aggregate: {
    exclude: true
  },
  create: {
    permissions: [Permission.DocumentManage]
  },
  update: {
    permissions: [Permission.DocumentManage]
  },
  delete: {
    permissions: [Permission.DocumentManage]
  },
  export: {
    exclude: true
  },
  fileUpload: {
    permissions: [Permission.DocumentManage]
  },
  fileDelete: {
    permissions: [Permission.DocumentManage]
  }
});
