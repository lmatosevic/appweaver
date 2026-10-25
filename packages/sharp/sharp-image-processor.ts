import { Readable } from 'node:stream';
import Sharp, { OutputInfo } from 'sharp';
import { createLogger, ImageConfig, ImageProcessor } from '@appweaver/common';

const logger = createLogger('storage');

const IMAGE_MIME_FORMATS: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/tiff': 'tiff'
};

/** Transforms the uploaded images with sharp. */
export class SharpImageProcessor extends ImageProcessor {
  public supports(mimeType: string): boolean {
    return mimeType in IMAGE_MIME_FORMATS;
  }

  /**
   * Applies the EXIF-based autorotation, then resizes and compresses the image by its config. When no config is
   * provided, only the autorotation is applied.
   */
  public process(
    stream: Readable,
    mimeType: string,
    config?: ImageConfig
  ): Readable {
    const format = IMAGE_MIME_FORMATS[mimeType];
    if (!format) {
      return stream;
    }

    let pipeline = Sharp().rotate();

    if (config) {
      const width = config.width ?? config.maxWidth;
      const height = config.height ?? config.maxHeight;
      const fit = config.fit ?? 'inside';

      if (width || height) {
        pipeline = pipeline.resize({
          width: width ?? undefined,
          height: height ?? undefined,
          fit,
          withoutEnlargement: !config.width && !config.height
        });
      }

      const opts = config.quality ? { quality: config.quality } : {};
      pipeline = pipeline.toFormat(format as any, opts);
    }

    const start = performance.now();
    pipeline.once('info', (info: OutputInfo) =>
      logger.debug(
        {
          mimeType,
          format: info.format,
          width: info.width,
          height: info.height,
          size: info.size,
          durationMs: Math.round(performance.now() - start)
        },
        'Image processed'
      )
    );

    return stream.pipe(pipeline);
  }
}
