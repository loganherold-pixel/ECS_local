const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const guardSource = fs.readFileSync(
  path.join(root, 'lib', 'navigationActiveGuidanceGuard.ts'),
  'utf8',
);
const discoverSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'discover.tsx'),
  'utf8',
);
const navigateSource = fs.readFileSync(
  path.join(root, 'app', '(tabs)', 'navigate.tsx'),
  'utf8',
);

assert(
  guardSource.includes("snapshot?.lifecycle === 'active'") &&
    guardSource.includes('ACTIVE_GUIDANCE_REPLACEMENT_CONFIRMED_AT') &&
    guardSource.includes('shouldProtectActiveGuidanceFromHandoff'),
  'Active guidance guard should treat active lifecycle as protected and expose confirmation metadata.',
);

assert(
  discoverSource.includes('Alert.alert(') &&
    discoverSource.includes('confirmRouteHandoffAgainstActiveGuidance') &&
    discoverSource.includes('getActiveGuidanceSnapshot()') &&
    discoverSource.includes('markNavigationHandoffActiveGuidanceReplacementConfirmed') &&
    discoverSource.includes('Preview New Route') &&
    discoverSource.includes('Keep Current'),
  'Explore route handoff should prompt before replacing active guidance.',
);

assert(
  discoverSource.includes('const confirmedPayload = await confirmRouteHandoffAgainstActiveGuidance(payload)') &&
    discoverSource.includes('await saveNavigationHandoffPayload(confirmedPayload)') &&
    discoverSource.includes('routeId: confirmedPayload.id') &&
    discoverSource.includes('tripMode: confirmedPayload.tripMode'),
  'Explore Build Route should stage only the confirmed replacement payload.',
);

assert(
  navigateSource.includes('shouldProtectActiveGuidanceFromHandoff(payload, activeRouteSnapshot)') &&
    navigateSource.includes('ACTIVE GUIDANCE PROTECTED - END NAVIGATION BEFORE PREVIEWING A NEW ROUTE') &&
    navigateSource.includes('await clearNavigationHandoffPayload()'),
  'Navigate should refuse unconfirmed handoffs while active guidance is running.',
);

assert(
  navigateSource.includes('hasActiveGuidanceReplacementConfirmation(payload)') &&
    navigateSource.includes('await endTrailNavigation()') &&
    navigateSource.includes('await endRoadNavigation()') &&
    navigateSource.includes('navigateRouteSessionStore.clear()'),
  'Navigate should end the current session only after an explicit replacement confirmation.',
);

assert(
  navigateSource.includes('confirmLocalRoutePreviewCanReplaceActiveGuidance') &&
    navigateSource.includes('Previewing "${targetTitle}" will end the current guidance') &&
    navigateSource.includes('const canReplaceActiveGuidance = await confirmLocalRoutePreviewCanReplaceActiveGuidance'),
  'Local saved route staging should also confirm before replacing active guidance.',
);

console.log('Active guidance replacement guard checks passed');
