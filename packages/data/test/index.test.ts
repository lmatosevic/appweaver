import * as data from '../index';
import { FileService } from '../storage/file-service';

describe('index', () => {
  test('exports the services an application injects', () => {
    expect(data.FileService).toBe(FileService);
    expect(data.ExportService).toBeDefined();
  });

  test('exports the factories and the config sections', () => {
    expect(data.createModel).toBeDefined();
    expect(data.createAuthModel).toBeDefined();
    expect(data.databaseConfig).toBeDefined();
    expect(data.apiKeyConfig).toBeDefined();
  });
});
