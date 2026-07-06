import type { LocalDataExport } from '../localDataExport';

declare const require: (modulePath: string) => unknown;

const SMOKE_SEED_EXPORT = require('./localDataSmokeSeedFixture.json') as LocalDataExport;

export function loadDevSmokeLocalDataSeed(): LocalDataExport {
  return SMOKE_SEED_EXPORT;
}
