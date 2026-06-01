const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const educationStore = read('lib/readiness/expeditionReadinessEducation.ts');
const educationCard = read('components/readiness/ReadinessEducationCard.tsx');
const readinessExports = read('lib/readiness/index.ts');
const componentExports = read('components/readiness/index.ts');
const commandBrief = read('components/brief/CommandBriefScreen.tsx');
const explorePreview = read('components/discover/ExploreRoutePreviewModal.tsx');
const navigateStrip = read('components/navigate/NavigateReadinessStrip.tsx');
const dashboardWidget = read('components/dashboard/ExpeditionReadinessWidget.tsx');
const routeImportScreen = read('app/(tabs)/route.tsx');
const navigateRunScreen = read('app/navigate-run.tsx');

const uiCopyCorpus = [
  educationStore,
  educationCard,
  commandBrief,
  explorePreview,
  navigateStrip,
  dashboardWidget,
  routeImportScreen,
  navigateRunScreen,
].join('\n');

assert(
  educationStore.includes('ecs_expedition_readiness_education_v1'),
  'Education dismissal state must use a stable storage key.',
);
assert(
  educationStore.includes('commandBriefEmpty')
    && educationStore.includes('exploreFirstReadiness')
    && educationStore.includes('navigateRoutePreview')
    && educationStore.includes('dashboardReadinessWidget'),
  'All required Expedition Readiness onboarding surfaces must be modeled.',
);
assert(
  educationStore.includes('dismiss(surface')
    && educationCard.includes('expeditionReadinessEducationStore.dismiss(surface)'),
  'Readiness education must be dismissible by surface.',
);
assert(
  educationStore.includes('ECS is not just a map.')
    && educationStore.includes('ECS Expedition Readiness combines your vehicle, route, weather, camp confidence, offline package, power, recovery options, and communications'),
  'Readiness education must explain the practical product difference.',
);
assert(
  educationStore.includes('Current inputs support the plan.')
    && educationStore.includes('Review recommended before departure.')
    && educationStore.includes('One or more blockers need attention.'),
  'Ready, Caution, and Hold statuses must be explained.',
);
assert(
  componentExports.includes("export * from './ReadinessEducationCard'")
    && readinessExports.includes("export * from './expeditionReadinessEducation'"),
  'Education card and store must be reusable through readiness indexes.',
);
assert(
  commandBrief.includes('surface="commandBriefEmpty"')
    && explorePreview.includes('surface="exploreFirstReadiness"')
    && navigateStrip.includes('surface="navigateRoutePreview"')
    && dashboardWidget.includes('surface="dashboardReadinessWidget"'),
  'Education must be wired into Command Brief, Explore, Navigate, and Dashboard readiness surfaces.',
);
assert(
  !/\bOnX\b/i.test(uiCopyCorpus),
  'App UI copy must not compare ECS to OnX or competitors.',
);
assert(
  !/\blegal campsite\b/i.test(uiCopyCorpus),
  'Education copy must not claim legal campsite certainty.',
);
assert(
  !/\bguaranteed safe\b/i.test(uiCopyCorpus),
  'Education copy must not claim guaranteed safety.',
);

console.log('Expedition Readiness onboarding checks passed.');
