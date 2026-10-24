import { Module } from '@appweaver/common';
import core from './core';
import data from './data';
import web from './web';
import redis from './redis';
import bullmq from './bullmq';
import cron from './cron';
import nodemailer from './nodemailer';
import handlebars from './handlebars';
import sharp from './sharp';

/**
 * The first-party modules, part of this package until each moves into its own package. A driver module is enabled
 * when the library it wraps is installed, as it will be by installing its package.
 */
export const firstPartyModules: { module: Module; library?: string }[] = [
  { module: core },
  { module: data, library: '@prisma/client' },
  { module: web },
  { module: redis, library: 'ioredis' },
  { module: bullmq, library: 'bullmq' },
  { module: cron, library: 'cron' },
  { module: nodemailer, library: 'nodemailer' },
  { module: handlebars, library: 'handlebars' },
  { module: sharp, library: 'sharp' }
];
