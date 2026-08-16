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

let databaseType: string | undefined;

// The config is frozen at import time, so the database type is swapped through a
// getter instead of by mutating it
jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  return {
    __esModule: true,
    ...actual,
    get config() {
      return { ...actual.config, DATABASE_TYPE: databaseType };
    }
  };
});

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
    databaseType = undefined;
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

    test.each([
      ['uuid()', 'uuid\\(\\)'],
      ['uuid(7)', 'uuid\\(7\\)'],
      ['cuid()', 'cuid\\(\\)'],
      ['cuid(2)', 'cuid\\(2\\)'],
      ['nanoid()', 'nanoid\\(\\)']
    ] as const)(
      'emits the %s string id generator',
      async (generator, pattern) => {
        const { schema } = await generate({
          Post: model('Post', { id: { type: 'string', generator } })
        });

        expect(schema).toMatch(
          new RegExp(`id\\s+String\\s+@id @default\\(${pattern}\\)`)
        );
      }
    );

    test('infers a string id from a string generator alone', async () => {
      const { schema } = await generate({
        Post: model('Post', { id: { generator: 'cuid()' } })
      });

      expect(schema).toMatch(/id\s+String\s+@id @default\(cuid\(\)\)/);
    });

    test('supports a big integer id', async () => {
      const { schema } = await generate({
        Post: model('Post', { id: { type: 'bigInt' } })
      });

      expect(schema).toMatch(/id\s+BigInt\s+@id @default\(autoincrement\(\)\)/);
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

    test.each([
      ['uuid()', '@db.Uuid'],
      ['uuid(7)', '@db.Uuid'],
      ['cuid()', '@db.VarChar(25)'],
      ['cuid(2)', '@db.VarChar(24)'],
      ['nanoid()', '@db.VarChar(21)']
    ] as const)(
      'sizes a PostgreSQL string id after its %s generator',
      async (generator, nativeType) => {
        databaseType = 'postgresql';

        const { schema } = await generate({
          Post: model('Post', { id: { type: 'string', generator } })
        });

        expect(schema).toContain(`@id @default(${generator}) ${nativeType}`);
      }
    );

    test('maps the uuid id to the native type of each database', async () => {
      const uuidModel = {
        Post: model('Post', { id: { type: 'string', generator: 'uuid()' } })
      };

      databaseType = 'mysql';
      expect((await generate(uuidModel)).schema).toContain('@db.Char(36)');

      databaseType = 'sqlserver';
      expect((await generate(uuidModel)).schema).toContain(
        '@db.UniqueIdentifier'
      );
    });

    test('leaves a generated string id untyped on SQLite', async () => {
      const { schema } = await generate({
        Post: model('Post', { id: { type: 'string', generator: 'cuid()' } })
      });

      expect(schema).toMatch(/id\s+String\s+@id @default\(cuid\(\)\)$/m);
      expect(schema).not.toContain('@db.');
    });

    test('keeps an auto increment id free of a native type', async () => {
      databaseType = 'postgresql';

      const { schema } = await generate({ Post: model('Post', {}) });

      expect(schema).toMatch(/id\s+Int\s+@id @default\(autoincrement\(\)\)$/m);
    });

    test('sizes a generated scalar after its generator', async () => {
      databaseType = 'postgresql';

      const { schema } = await generate({
        Post: model('Post', {
          scalars: {
            uid: { type: 'string', defaultGenerator: 'uuid()' },
            token: { type: 'string', defaultGenerator: 'nanoid()' }
          }
        })
      });

      expect(schema).toMatch(/uid\s+String\s+@default\(uuid\(\)\) @db\.Uuid/);
      expect(schema).toMatch(
        /token\s+String\s+@default\(nanoid\(\)\) @db\.VarChar\(21\)/
      );
    });

    test('prefers the generator width over an explicit maxLength', async () => {
      databaseType = 'postgresql';

      const { schema } = await generate({
        Post: model('Post', {
          scalars: {
            uid: { type: 'string', defaultGenerator: 'uuid()', maxLength: 255 }
          }
        })
      });

      expect(schema).toContain('@db.Uuid');
      expect(schema).not.toContain('@db.VarChar(255)');
    });

    test('keeps the maxLength column for scalars without a generator', async () => {
      databaseType = 'postgresql';

      const { schema } = await generate({
        Post: model('Post', {
          scalars: { title: { type: 'string', maxLength: 120 } }
        })
      });

      expect(schema).toContain('@db.VarChar(120)');
    });

    test('ignores generators that produce no string value', async () => {
      databaseType = 'postgresql';

      const { schema } = await generate({
        Post: model('Post', {
          scalars: {
            createdOn: { type: 'dateTime', defaultGenerator: 'now()' }
          }
        })
      });

      expect(schema).toMatch(/createdOn\s+DateTime\s+@default\(now\(\)\)$/m);
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
          relations: {
            author: { model: 'User', type: 'oneToMany', owner: true }
          }
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
              type: 'oneToMany',
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
          relations: {
            author: { model: 'User', type: 'oneToMany', owner: true }
          }
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
            articles: { model: 'Post', type: 'oneToMany', mappedBy: 'author' }
          }
        }),
        Post: model('Post', {
          relations: {
            author: {
              model: 'User',
              type: 'oneToMany',
              owner: true,
              mappedBy: 'articles'
            }
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

    test('creates a one-to-one relation with a unique foreign key', async () => {
      const { schema } = await generate({
        User: model('User', {}),
        Profile: model('Profile', {
          relations: { user: { model: 'User', type: 'oneToOne', owner: true } }
        })
      });

      expect(schema).toContain(
        '@relation("ProfileUserUser", fields: [userId], references: [id])'
      );
      expect(schema).toMatch(/userId\s+Int\s+@unique/);

      // The back reference on the inverse side is a single optional field
      const userModel = schema.slice(schema.indexOf('model User {'));
      expect(userModel).toMatch(
        /profile\s+Profile\?\s+@relation\("ProfileUserUser"\)/
      );
    });

    test('uses the mapped field for a bidirectional one-to-one relation', async () => {
      const { schema } = await generate({
        User: model('User', {
          relations: {
            profile: { model: 'Profile', type: 'oneToOne', mappedBy: 'user' }
          }
        }),
        Profile: model('Profile', {
          relations: {
            user: {
              model: 'User',
              type: 'oneToOne',
              owner: true,
              mappedBy: 'profile'
            }
          }
        })
      });

      const userModel = schema.slice(
        schema.indexOf('model User {'),
        schema.indexOf('model Profile {')
      );
      expect(userModel).toMatch(
        /profile\s+Profile\?\s+@relation\("UserProfileProfile"\)/
      );

      const profileModel = schema.slice(schema.indexOf('model Profile {'));
      expect(profileModel).toContain(
        '@relation("UserProfileProfile", fields: [userId], references: [id])'
      );
      expect(profileModel).toMatch(/userId\s+Int\s+@unique/);
    });

    test('creates list fields on both sides of a many-to-many relation', async () => {
      const { schema } = await generate({
        Post: model('Post', {
          relations: { tags: { model: 'Tag', type: 'manyToMany' } }
        }),
        Tag: model('Tag', {})
      });

      const postModel = schema.slice(
        schema.indexOf('model Post {'),
        schema.indexOf('model Tag {')
      );
      expect(postModel).toMatch(/tags\s+Tag\[]\s+@relation\("PostTagsTag"\)/);

      const tagModel = schema.slice(schema.indexOf('model Tag {'));
      expect(tagModel).toMatch(/posts\s+Post\[]\s+@relation\("PostTagsTag"\)/);
    });

    test('adds the foreign key to the referenced model for a lone list side', async () => {
      const { schema } = await generate({
        User: model('User', {
          relations: { posts: { model: 'Post', type: 'oneToMany' } }
        }),
        Post: model('Post', {})
      });

      const userModel = schema.slice(
        schema.indexOf('model User {'),
        schema.indexOf('model Post {')
      );
      expect(userModel).toMatch(
        /posts\s+Post\[]\s+@relation\("UserPostsPost"\)/
      );

      const postModel = schema.slice(schema.indexOf('model Post {'));
      expect(postModel).toContain(
        '@relation("UserPostsPost", fields: [userId], references: [id])'
      );
      expect(postModel).toMatch(/userId\s+Int\?/);
    });

    test('fails when the mapped relation types mismatch', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { status, schema } = await generate({
        User: model('User', {
          relations: {
            posts: { model: 'Post', type: 'manyToMany', mappedBy: 'author' }
          }
        }),
        Post: model('Post', {
          relations: {
            author: {
              model: 'User',
              type: 'oneToMany',
              owner: true,
              mappedBy: 'posts'
            }
          }
        })
      });

      expect(status).toBe(2);
      expect(schema).toBe('');
      expect(runProcess).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        "Relation type mismatch: 'User.posts' is declared as 'manyToMany' but 'Post.author' is declared as 'oneToMany'."
      );
    });

    test('fails when both mapped relation sides declare the owner', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { status } = await generate({
        User: model('User', {
          relations: {
            profile: {
              model: 'Profile',
              type: 'oneToOne',
              owner: true,
              mappedBy: 'user'
            }
          }
        }),
        Profile: model('Profile', {
          relations: {
            user: {
              model: 'User',
              type: 'oneToOne',
              owner: true,
              mappedBy: 'profile'
            }
          }
        })
      });

      expect(status).toBe(2);
      expect(error).toHaveBeenCalledWith(
        "Relation owner conflict: both 'User.profile' and 'Profile.user' declare 'owner: true' for the 'oneToOne' relation."
      );
    });

    test('fails when no mapped relation side declares the owner', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { status } = await generate({
        User: model('User', {
          relations: {
            posts: { model: 'Post', type: 'oneToMany', mappedBy: 'author' }
          }
        }),
        Post: model('Post', {
          relations: {
            author: { model: 'User', type: 'oneToMany', mappedBy: 'posts' }
          }
        })
      });

      expect(status).toBe(2);
      expect(error).toHaveBeenCalledWith(
        "Relation owner missing: neither 'User.posts' nor 'Post.author' declares 'owner: true' for the 'oneToMany' relation."
      );
    });

    test('fails when the mapped relation references another model', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { status } = await generate({
        Team: model('Team', {}),
        User: model('User', {
          relations: {
            posts: { model: 'Post', type: 'oneToMany', mappedBy: 'author' }
          }
        }),
        Post: model('Post', {
          relations: {
            author: {
              model: 'Team',
              type: 'oneToMany',
              owner: true,
              mappedBy: 'posts'
            }
          }
        })
      });

      expect(status).toBe(2);
      expect(error).toHaveBeenCalledWith(
        "Relation 'User.posts' is mapped by 'Post.author', which references model 'Team' instead of 'User'."
      );
    });

    test('reports a relation pair inconsistency only once', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});

      await generate({
        User: model('User', {
          relations: {
            posts: { model: 'Post', type: 'manyToMany', mappedBy: 'author' }
          }
        }),
        Post: model('Post', {
          relations: {
            author: {
              model: 'User',
              type: 'oneToMany',
              owner: true,
              mappedBy: 'posts'
            }
          }
        })
      });

      const mismatchErrors = error.mock.calls.filter(([message]) =>
        String(message).includes('Relation type mismatch')
      );
      expect(mismatchErrors).toHaveLength(1);
    });

    test('tolerates a mappedBy field missing on the target model', async () => {
      const { status, schema } = await generate({
        User: model('User', {}),
        Post: model('Post', {
          relations: {
            author: {
              model: 'User',
              type: 'oneToMany',
              owner: true,
              mappedBy: 'articles'
            }
          }
        })
      });

      expect(status).toBe(0);
      expect(schema).toContain('model Post {');
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

    test('types the owning foreign key after the string id of the referenced model', async () => {
      const { schema } = await generate({
        User: model('User', { id: { type: 'string' } }),
        Post: model('Post', {
          relations: {
            author: { model: 'User', type: 'oneToMany', owner: true }
          }
        })
      });

      const postModel = schema.slice(schema.indexOf('model Post {'));
      expect(postModel).toMatch(/authorId\s+String\b/);
      expect(postModel).not.toMatch(/authorId\s+Int\b/);
    });

    test('types a one-to-one foreign key after the string id of the referenced model', async () => {
      const { schema } = await generate({
        User: model('User', { id: { type: 'string' } }),
        Profile: model('Profile', {
          relations: { user: { model: 'User', type: 'oneToOne', owner: true } }
        })
      });

      expect(schema).toMatch(/userId\s+String\s+@unique/);
    });

    test('types the generated back reference foreign key after the string id of the owner', async () => {
      const { schema } = await generate({
        User: model('User', {
          id: { type: 'string' },
          relations: { posts: { model: 'Post', type: 'oneToMany' } }
        }),
        Post: model('Post', {})
      });

      const postModel = schema.slice(schema.indexOf('model Post {'));
      expect(postModel).toContain(
        '@relation("UserPostsPost", fields: [userId], references: [id])'
      );
      expect(postModel).toMatch(/userId\s+String\?/);
    });

    test('keeps the relation fields of a string id model out of the back reference pass', async () => {
      const { schema } = await generate({
        User: model('User', { id: { type: 'string' } }),
        Post: model('Post', {
          id: { type: 'string' },
          relations: {
            author: { model: 'User', type: 'oneToMany', owner: true }
          }
        })
      });

      // A String foreign key column mistaken for a relation field would emit a
      // duplicate back reference on the User model
      const userModel = schema.slice(schema.indexOf('model User {'));
      expect(userModel.match(/@relation\("PostAuthorUser"\)/g)).toHaveLength(1);
      expect(userModel).toMatch(/posts\s+Post\[]/);
    });

    test('types the file foreign key after the string id of the file model', async () => {
      const { schema } = await generate({
        File: model('File', { id: { type: 'string' } }),
        Post: model('Post', { files: { image: {} } })
      });

      expect(schema).toMatch(/imageId\s+String\?\s+@unique/);
    });

    test('types the ownership column after the string id of the auth model', async () => {
      const { schema } = await generate({
        User: model('User', { id: { type: 'string' } }, true),
        Post: model('Post', {})
      });

      expect(schema).toContain(
        '@relation("PostCreatedByUser", fields: [createdById], references: [id])'
      );
      expect(schema).toMatch(/createdById\s+String\?/);
    });

    test('gives the owning foreign key the native type of the referenced id', async () => {
      databaseType = 'postgresql';

      const { schema } = await generate({
        User: model('User', { id: { type: 'string' } }),
        Post: model('Post', {
          relations: {
            author: { model: 'User', type: 'oneToMany', owner: true },
            editor: { model: 'User', type: 'oneToOne', owner: true }
          }
        })
      });

      const postModel = schema.slice(schema.indexOf('model Post {'));
      expect(postModel).toMatch(/authorId\s+String\s+@db\.Uuid/);
      expect(postModel).toMatch(/editorId\s+String\s+@unique @db\.Uuid/);
    });

    test('gives the generated back reference foreign key the native type of the owner id', async () => {
      databaseType = 'postgresql';

      const { schema } = await generate({
        User: model('User', {
          id: { generator: 'cuid(2)' },
          relations: { posts: { model: 'Post', type: 'oneToMany' } }
        }),
        Post: model('Post', {})
      });

      const postModel = schema.slice(schema.indexOf('model Post {'));
      expect(postModel).toMatch(/userId\s+String\?\s+@db\.VarChar\(24\)/);
    });

    test('gives the file foreign key the native type of the file id', async () => {
      databaseType = 'postgresql';

      const { schema } = await generate({
        File: model('File', { id: { type: 'string' } }),
        Post: model('Post', { files: { image: {} } })
      });

      expect(schema).toMatch(/imageId\s+String\?\s+@unique @db\.Uuid/);
    });

    test('gives the ownership column the native type of the auth model id', async () => {
      databaseType = 'postgresql';

      const { schema } = await generate({
        User: model('User', { id: { generator: 'nanoid()' } }, true),
        Post: model('Post', {})
      });

      expect(schema).toMatch(/createdById\s+String\?\s+@db\.VarChar\(21\)/);
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

    test('adds the sort order for signed index fields', async () => {
      const { schema } = await generate({
        Post: model('Post', {
          scalars: {
            title: { type: 'string' },
            slug: { type: 'string' },
            views: { type: 'int' }
          },
          index: ['-title', '+slug', ['-title', 'slug', '+views']]
        })
      });

      expect(schema).toContain('@@index(title(sort: Desc))');
      expect(schema).toContain('@@index(slug(sort: Asc))');
      expect(schema).toContain(
        '@@index([title(sort: Desc), slug, views(sort: Asc)])'
      );
    });

    test('keeps the same field indexed in both sort orders', async () => {
      const { schema } = await generate({
        Post: model('Post', {
          scalars: { title: { type: 'string' } },
          index: ['title', '-title', '-title']
        })
      });

      expect(schema).toContain('@@index(title)');
      expect(schema.match(/@@index\(title\(sort: Desc\)\)/g)).toHaveLength(1);
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
