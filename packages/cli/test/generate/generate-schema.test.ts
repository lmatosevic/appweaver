import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_TYPE,
  ResourceModel,
  ResourceModelConfig
} from '@appweaver/common';

const runProcess = jest.fn<Promise<number>, any[]>();

// Only the process spawning is stubbed, the path helpers stay real. The utils
// barrel is mocked directly to keep `fkill` (ESM only) out of the test runtime.
jest.mock('../../utils', () => {
  const pathUtil = jest.requireActual('../../utils/path-util');
  return {
    ensureDirExists: pathUtil.ensureDirExists,
    relativePathFrom: pathUtil.relativePathFrom,
    runProcess: (...args: any[]) => runProcess(...args)
  };
});

import { generateSchema } from '../../generate/generate-schema';

/** Creates a minimal resource model as produced by `createModel`. */
function model(
  name: string,
  config: Omit<Partial<ResourceModelConfig>, 'name'>,
  auth: boolean = false
): ResourceModel {
  return {
    name,
    config: { name, ...config },
    [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE,
    [RESOURCE_AUTH]: auth
  } as unknown as ResourceModel;
}

describe('generate-schema', () => {
  let tempDir: string;
  let originalCwd: string;
  const schemaPath = './database/schema.prisma';
  const clientPath = './database/client';

  const generate = async (
    models: Record<string, ResourceModel>
  ): Promise<{ status: number; schema: string }> => {
    const status = await generateSchema(models, schemaPath, clientPath, true);
    const schemaFile = path.join(tempDir, schemaPath);
    return {
      status,
      schema: fs.existsSync(schemaFile)
        ? fs.readFileSync(schemaFile, 'utf8')
        : ''
    };
  };

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-schema-'));
    process.chdir(tempDir);
    runProcess.mockReset();
    runProcess.mockResolvedValue(0);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('generateSchema', () => {
    test('writes the schema file and runs the Prisma generator', async () => {
      const { status, schema } = await generate({
        Post: model('Post', { scalars: { title: { type: 'string' } } })
      });

      expect(status).toBe(0);
      expect(runProcess).toHaveBeenCalledWith('prisma', ['generate'], {
        quiet: true
      });
      expect(schema).toContain('model Post {');
    });

    test('creates the schema directory when it does not exist', async () => {
      await generate({ Post: model('Post', {}) });

      expect(fs.existsSync(path.join(tempDir, 'database'))).toBe(true);
    });

    test('adds the datasource and the client generator blocks', async () => {
      const { schema } = await generate({ Post: model('Post', {}) });

      expect(schema).toContain('datasource db {');
      expect(schema).toContain('provider = "sqlite"');
      expect(schema).toContain('generator client {');
      expect(schema).toContain('provider = "prisma-client"');
      expect(schema).toContain('output   = "./client"');
    });

    test('adds an auto increment integer id by default', async () => {
      const { schema } = await generate({ Post: model('Post', {}) });

      expect(schema).toMatch(/id\s+Int\s+@id @default\(autoincrement\(\)\)/);
    });

    test('supports a string id with a uuid generator', async () => {
      const { schema } = await generate({
        Post: model('Post', { id: { type: 'string' } })
      });

      expect(schema).toMatch(/id\s+String\s+@id @default\(uuid\(\)\)/);
    });

    test('maps scalar types and the optional modifier', async () => {
      const { schema } = await generate({
        Post: model('Post', {
          scalars: {
            title: { type: 'string' },
            views: { type: 'int', required: false },
            rating: { type: 'float' },
            enabled: { type: 'boolean' },
            publishedAt: { type: 'dateTime', required: false }
          }
        })
      });

      expect(schema).toMatch(/title\s+String\b/);
      expect(schema).toMatch(/views\s+Int\?/);
      expect(schema).toMatch(/rating\s+Float\b/);
      expect(schema).toMatch(/enabled\s+Boolean\b/);
      expect(schema).toMatch(/publishedAt\s+DateTime\?/);
    });

    test('marks unique scalars', async () => {
      const { schema } = await generate({
        Post: model('Post', {
          scalars: { slug: { type: 'string', unique: true } }
        })
      });

      expect(schema).toMatch(/slug\s+String\s+@unique/);
    });

    test('renders scalar defaults by type', async () => {
      const { schema } = await generate({
        Post: model('Post', {
          scalars: {
            title: { type: 'string', default: 'Untitled' },
            views: { type: 'int', default: 0 },
            enabled: { type: 'boolean', default: true },
            tags: { type: 'string', array: true, default: ['a', 'b'] }
          }
        })
      });

      expect(schema).toContain('@default("Untitled")');
      expect(schema).toContain('@default(0)');
      expect(schema).toContain('@default(true)');
      expect(schema).toContain('@default(["a", "b"])');
    });

    test('supports default generators and database expressions', async () => {
      const { schema } = await generate({
        Post: model('Post', {
          scalars: {
            uid: { type: 'string', defaultGenerator: 'uuid()' },
            createdOn: {
              type: 'dateTime',
              defaultExpression: 'CURRENT_TIMESTAMP'
            }
          }
        })
      });

      expect(schema).toContain('@default(uuid())');
      expect(schema).toContain('@default(dbgenerated("CURRENT_TIMESTAMP"))');
    });

    test('generates an enum type for enum scalars', async () => {
      const { schema } = await generate({
        Post: model('Post', {
          scalars: {
            status: {
              type: 'enum',
              values: ['draft', 'published'],
              default: 'draft'
            }
          }
        })
      });

      expect(schema).toMatch(/status\s+PostStatus/);
      expect(schema).toContain('enum PostStatus {');
      expect(schema).toContain('  draft');
      expect(schema).toContain('  published');
    });

    test('omits the VarChar attribute for SQLite', async () => {
      const { schema } = await generate({
        Post: model('Post', {
          scalars: { title: { type: 'string', maxLength: 120 } }
        })
      });

      expect(schema).not.toContain('@db.VarChar');
    });

    test('creates an owning relation with a foreign key column', async () => {
      const { schema } = await generate({
        User: model('User', {}),
        Post: model('Post', {
          relations: { author: { model: 'User', owner: true } }
        })
      });

      expect(schema).toContain(
        '@relation("PostAuthorUser", fields: [authorId], references: [id])'
      );
      expect(schema).toMatch(/authorId\s+Int\b/);
    });

    test('adds the referential actions to a relation', async () => {
      const { schema } = await generate({
        User: model('User', {}),
        Post: model('Post', {
          relations: {
            author: {
              model: 'User',
              owner: true,
              onDelete: 'cascade',
              onUpdate: 'cascade'
            }
          }
        })
      });

      expect(schema).toContain('onDelete: Cascade, onUpdate: Cascade');
    });

    test('adds the back reference list field on the referenced model', async () => {
      const { schema } = await generate({
        User: model('User', {}),
        Post: model('Post', {
          relations: { author: { model: 'User', owner: true } }
        })
      });

      const userModel = schema.slice(schema.indexOf('model User {'));
      expect(userModel).toMatch(
        /posts\s+Post\[]\s+@relation\("PostAuthorUser"/
      );
    });

    test('uses the mapped field for a bidirectional relation', async () => {
      const { schema } = await generate({
        User: model('User', {
          relations: {
            articles: { model: 'Post', array: true, mappedBy: 'author' }
          }
        }),
        Post: model('Post', {
          relations: {
            author: { model: 'User', owner: true, mappedBy: 'articles' }
          }
        })
      });

      // The mapped field keeps its own relation name on both sides
      const userModel = schema.slice(schema.indexOf('model User {'));
      expect(userModel).toMatch(
        /articles\s+Post\[]\s+@relation\("UserArticlesPost"\)/
      );
      expect(userModel).not.toContain('posts ');

      const postModel = schema.slice(schema.indexOf('model Post {'));
      expect(postModel).toContain(
        '@relation("UserArticlesPost", fields: [authorId], references: [id])'
      );
    });

    test('creates optional file relations with a unique foreign key', async () => {
      const { schema } = await generate({
        File: model('File', {}),
        Post: model('Post', { files: { image: {} } })
      });

      expect(schema).toContain(
        '@relation("PostImageFile", fields: [imageId], references: [id])'
      );
      expect(schema).toMatch(/imageId\s+Int\?\s+@unique/);
      expect(schema).toContain('/// Related models with file columns');
      expect(schema).toMatch(/imagePosts\s+Post\[]/);
    });

    test('creates a file list relation without a foreign key', async () => {
      const { schema } = await generate({
        File: model('File', {}),
        Post: model('Post', { files: { gallery: { array: true } } })
      });

      expect(schema).toMatch(
        /gallery\s+File\[]\s+@relation\("PostGalleryFile"\)/
      );
      expect(schema).not.toContain('galleryId');
    });

    test('adds the audit columns by default', async () => {
      const { schema } = await generate({ Post: model('Post', {}) });

      expect(schema).toContain('/// Audit columns');
      expect(schema).toContain('updatedAt DateTime @updatedAt');
      expect(schema).toContain('createdAt DateTime @default(now())');
    });

    test('omits the audit columns that are disabled', async () => {
      const { schema } = await generate({
        Post: model('Post', { audit: { updatedAt: false, createdAt: false } })
      });

      expect(schema).not.toContain('@updatedAt');
      expect(schema).not.toContain('@default(now())');
    });

    test('links the ownership columns to the auth model', async () => {
      const { schema } = await generate({
        User: model('User', {}, true),
        Post: model('Post', {})
      });

      expect(schema).toContain(
        '@relation("PostCreatedByUser", fields: [createdById], references: [id])'
      );
      expect(schema).toMatch(/createdById\s+Int\?/);

      const userModel = schema.slice(schema.indexOf('model User {'));
      expect(userModel).toContain(
        '/// Ownership models referenced with createdById column'
      );
      expect(userModel).toMatch(
        /createdPosts\s+Post\[]\s+@relation\("PostCreatedByUser"\)/
      );
    });

    test('skips the ownership columns without an auth model', async () => {
      const { schema } = await generate({ Post: model('Post', {}) });

      expect(schema).not.toContain('createdById');
    });

    test('adds single and composite indexes', async () => {
      const { schema } = await generate({
        Post: model('Post', {
          scalars: { title: { type: 'string' }, slug: { type: 'string' } },
          index: ['title', ['title', 'slug'], 'title']
        })
      });

      expect(schema).toContain('@@index(title)');
      expect(schema).toContain('@@index([title, slug])');
      expect(schema.match(/@@index\(title\)/g)).toHaveLength(1);
    });

    test('maps the model to a custom table name', async () => {
      const { schema } = await generate({
        Post: model('Post', { tableName: 'blog_posts' })
      });

      expect(schema).toContain('@@map("blog_posts")');
    });

    test('skips models with schema generation disabled', async () => {
      const { schema } = await generate({
        Post: model('Post', {}),
        Draft: model('Draft', { generateSchema: false })
      });

      expect(schema).toContain('model Post {');
      expect(schema).not.toContain('model Draft {');
    });

    test('restores the previous schema when the Prisma generator fails', async () => {
      const schemaFile = path.join(tempDir, schemaPath);
      fs.mkdirSync(path.dirname(schemaFile), { recursive: true });
      fs.writeFileSync(schemaFile, '// previous schema', 'utf8');
      jest.spyOn(console, 'error').mockImplementation(() => {});
      runProcess.mockResolvedValue(1);

      const { status, schema } = await generate({ Post: model('Post', {}) });

      expect(status).toBe(1);
      expect(schema).toBe('// previous schema');
    });

    test('returns 2 and keeps the process alive when the generation throws', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});

      const status = await generateSchema(
        { Post: { name: 'Post' } as any },
        schemaPath,
        clientPath,
        true
      );

      expect(status).toBe(2);
      expect(error).toHaveBeenCalled();
    });
  });
});
