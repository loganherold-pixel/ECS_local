import type { LocalDataExport } from '../localDataExport';

export function loadDevSmokeLocalDataSeed(): LocalDataExport {
  return require('../../fixtures/local-data/ecs-smoke-local-profile.json') as LocalDataExport;
}
