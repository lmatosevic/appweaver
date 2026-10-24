import { Module } from '@appweaver/common';
import core from './core';

/** The modules always enabled, before the ones of the packages, the application and the `app.modules` paths. */
export const firstPartyModules: { module: Module }[] = [{ module: core }];
