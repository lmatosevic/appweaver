import { ImageProcessor, logger, ResourceModel } from '@appweaver/common';
import { define } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { resetContext } from '@appweaver/testing';
import { warnUnprocessedImages } from '../../resource/load-data-resources';

/** Registers a model with the given file fields. */
const model = (name: string, files: Record<string, object>) =>
  context.resource.models.set(name, {
    name,
    config: { name, files }
  } as unknown as ResourceModel);

describe('load-data-resources', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    resetContext();
    warn = jest.spyOn(logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    resetContext();
  });

  describe('warnUnprocessedImages', () => {
    test('warns about the fields transforming images without a processor', () => {
      model('User', { avatar: { image: { maxWidth: 256 } }, cv: {} });
      model('Post', { cover: { image: { quality: 80 } } });

      warnUnprocessedImages();

      expect(warn).toHaveBeenCalledWith(
        { fields: ['User.avatar', 'Post.cover'] },
        expect.stringContaining('no image processor is provided')
      );
    });

    test('stays silent with an image processor', () => {
      model('User', { avatar: { image: { maxWidth: 256 } } });
      define({ supports: () => true }, ImageProcessor);

      warnUnprocessedImages();

      expect(warn).not.toHaveBeenCalled();
    });

    test('stays silent without fields transforming images', () => {
      model('User', { cv: {} });

      warnUnprocessedImages();

      expect(warn).not.toHaveBeenCalled();
    });
  });
});
