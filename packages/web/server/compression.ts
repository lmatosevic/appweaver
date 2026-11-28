import { constants } from 'node:zlib';
import fastifyCompress, { FastifyCompressOptions } from '@fastify/compress';
import {
  CompressionEncoding,
  RouteCompressConfig,
  textToBytes
} from '@appweaver/common';
import { accountConfig, securityConfig } from '../security/security-config';
import { Server } from '../types/server';
import { compressionConfig } from './server-config';

type CompressOptions = Pick<
  FastifyCompressOptions,
  'threshold' | 'encodings' | 'zlibOptions' | 'brotliOptions'
>;

const DEFAULT_LEVELS = { zstd: 3, br: 4, gzip: 6 };

/**
 * Registers the response compression of `server.compression`, every route taking the `compress` option of its
 * config. The routes of the authentication are not compressed unless they set it: their bodies carry tokens, which
 * a compression beside reflected input exposes to the BREACH attack.
 */
export function registerCompression(server: Server): void {
  const levels = { ...DEFAULT_LEVELS, ...compressionConfig.LEVELS };
  const encodings = compressionConfig.ENCODINGS as CompressionEncoding[];
  const secretPrefixes = [
    securityConfig.ROUTE_PREFIX,
    accountConfig.ROUTE_PREFIX
  ].map((prefix) => prefix.replace(/\/$/, ''));

  // Before the hook of the plugin, which reads the compress option of the route
  server.addHook('onRoute', (route) => {
    const compress = route.config?.compress;
    if (route.compress !== undefined) {
      return;
    }
    if (compress === undefined) {
      if (secretPrefixes.some((prefix) => isUnder(route.url, prefix))) {
        route.compress = false;
      }
      return;
    }
    route.compress =
      compress === false
        ? false
        : compressOptions(compress === true ? {} : compress, encodings, levels);
  });

  server.register(fastifyCompress, {
    global: true,
    // The request bodies stay as they are sent, so the body limits apply to what is read
    globalDecompression: false,
    respectNoTransform: compressionConfig.RESPECT_NO_TRANSFORM,
    ...(compressionConfig.SYNC_THRESHOLD !== undefined
      ? { syncThreshold: textToBytes(compressionConfig.SYNC_THRESHOLD) }
      : {}),
    ...compressOptions({}, encodings, levels)
  });
}

/** The options of the plugin for the config of a route over the global config. */
function compressOptions(
  config: RouteCompressConfig,
  encodings: CompressionEncoding[],
  levels: typeof DEFAULT_LEVELS
): CompressOptions {
  const merged = { ...levels, ...config.levels };
  const threshold = config.threshold ?? compressionConfig.THRESHOLD;
  return {
    threshold:
      typeof threshold === 'number' ? threshold : textToBytes(threshold),
    encodings: config.encodings ?? encodings,
    // zstd reads its level from the zlib options, gzip and deflate ignore its params
    zlibOptions: {
      level: merged.gzip,
      params: { [constants.ZSTD_c_compressionLevel]: merged.zstd }
    } as CompressOptions['zlibOptions'],
    brotliOptions: {
      params: { [constants.BROTLI_PARAM_QUALITY]: merged.br }
    }
  };
}

function isUnder(url: string, prefix: string): boolean {
  return url === prefix || url.startsWith(`${prefix}/`);
}
