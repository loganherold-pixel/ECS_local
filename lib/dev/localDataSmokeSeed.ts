import type { LocalDataExport } from '../localDataExport';

declare const require: ((modulePath: string) => unknown) | undefined;

export function loadDevSmokeLocalDataSeed(): LocalDataExport {
  const fixturePath = '../../fixtures/local-data/ecs-smoke-local-profile.json';
  const dynamicRequire = typeof require === 'function' ? require : null;
  if (!dynamicRequire) {
    throw new Error('Smoke seed fixture is unavailable in this runtime. Use Import local data with the fixture JSON instead.');
  }
  return dynamicRequire(fixturePath) as LocalDataExport;
}
