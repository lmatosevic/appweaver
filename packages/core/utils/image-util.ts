import { Readable } from 'node:stream';
import sharp from 'sharp';
import { ImageConfig } from '@appweaver/common';

const IMAGE_MIME_FORMATS: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/tiff': 'tiff'
};

/**
 * Determines if the provided MIME type corresponds to a processable image format.
 *
 * @param {string} mimeType - The MIME type of the image to check.
 * @return {boolean} Returns true if the MIME type is in the list of processable image formats, otherwise false.
 */
export function isProcessableImage(mimeType: string): boolean {
  return mimeType in IMAGE_MIME_FORMATS;
}

/**
 * Processes an image stream by applying EXIF-based autorotation, resizing, and compressing based on the
 * provided configuration. When no config is provided, only EXIF-based autorotation is applied.
 *
 * @param {Readable} stream - The readable stream representing the input image.
 * @param {string} mimeType - The MIME type of the input image (e.g., "image/jpeg", "image/png").
 * @param {ImageConfig} [config] - Configuration for image processing, including dimensions, quality, and other options.
 * @return {Readable} A readable stream of the processed image.
 */
export function processImage(
  stream: Readable,
  mimeType: string,
  config?: ImageConfig
): Readable {
  const format = IMAGE_MIME_FORMATS[mimeType];
  if (!format) {
    return stream;
  }

  let pipeline = sharp().rotate();

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

  return stream.pipe(pipeline);
}
