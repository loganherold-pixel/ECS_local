const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const navigate = read(path.join('app', '(tabs)', 'navigate.tsx'));
const overlay = read(path.join('components', 'navigate', 'RoadNavigationOverlay.tsx'));
const strip = read(path.join('components', 'navigate', 'NavigateReadinessStrip.tsx'));
const readinessToast = read(path.join('components', 'readiness', 'ReadinessAlertToast.tsx'));

assert(
  navigate.includes("import NavigateReadinessStrip from '../../components/navigate/NavigateReadinessStrip';"),
  'Navigate must import the compact readiness strip.',
);
assert(
  navigate.includes('previewReadinessAccessory') && navigate.includes('previewAccessory={previewReadinessAccessory}'),
  'Route preview must pass the readiness surface through the existing preview accessory slot.',
);
assert(
  navigate.includes('activeReadinessAccessory') && navigate.includes('activeAccessory={activeReadinessAccessory}'),
  'Active guidance must pass compact readiness through the active accessory slot.',
);
assert(
  navigate.includes('handleOpenCommandBriefFromNavigate') &&
    navigate.includes("dashboardTab: 'brief'") &&
    navigate.includes("router.push('/dashboard' as any)"),
  'Navigate readiness must route users into the Command Brief tab.',
);
assert(
  navigate.includes('briefBannerBottomOffset = commandDockHeight + 6') &&
    navigate.includes('styles.aiAssistBannerWrap') &&
    navigate.includes('bottom: briefBannerBottomOffset'),
  'Navigate ECS Brief assist banner must be anchored directly above the bottom command dock.',
);
assert(
  navigate.includes('renderedAiAssistBanner') &&
    navigate.includes('aiAssistBannerOpacity') &&
    navigate.includes('NAV_AI_ASSIST_FADE_IN_MS') &&
    navigate.includes('NAV_AI_ASSIST_FADE_OUT_MS') &&
    navigate.includes('<Animated.View') &&
    navigate.includes('dismissAiAssistBannerWithFade'),
  'Navigate ECS Brief assist banner should fade in/out instead of abruptly mounting and unmounting.',
);
assert(
  readinessToast.includes('READINESS_TOAST_FADE_IN_MS') &&
    readinessToast.includes('READINESS_TOAST_FADE_OUT_MS') &&
    readinessToast.includes('dismissWithFade') &&
    readinessToast.includes('<Animated.View') &&
    readinessToast.includes('useNativeDriver: true') &&
    readinessToast.includes('new Animated.Value(0)') &&
    readinessToast.includes('useReducedMotion()'),
  'Readiness alert toast should use native opacity fade-in/fade-out animation.',
);
assert(
  !navigate.includes("eyebrow: 'ECS UPDATE'"),
  'Navigate ECS Brief assist banner should not be routed through the upper header guidance fallback.',
);
assert(
  navigate.includes('expeditionReadinessStore.setReadinessInputPatch') &&
    navigate.includes('campCandidates: navigateCampOverlayReadinessCandidates'),
  'Navigate camp overlays must patch readiness camp confidence instead of duplicating scoring logic.',
);
assert(
  navigate.includes('!navigateVehicleContext.hasActiveVehicleId || !navigateVehicleContext.activeVehicleId') &&
    navigate.includes("missing.push('Vehicle profile is not selected.')"),
  'Navigate launch readiness must still account for missing active vehicle context.',
);
assert(
  overlay.includes('activeAccessory?: React.ReactNode') &&
    overlay.includes('activeAccessory={props.activeAccessory}') &&
    overlay.includes('styles.activeAccessoryWrap'),
  'RoadNavigationOverlay must support a bounded active guidance accessory.',
);
assert(
  overlay.includes('activeAccessoryMinimized?: boolean') &&
    overlay.includes('onExpandActiveAccessory?: () => void') &&
    overlay.includes('Reopen Active Expedition Readiness') &&
    overlay.includes('activeReadinessMiniButton'),
  'RoadNavigationOverlay should expose an independent Active Expedition Readiness reopen control.',
);
assert(
  navigate.includes('const [activeReadinessMinimized, setActiveReadinessMinimized] = useState(true);') &&
    navigate.includes('onExpandActiveAccessory={() => setActiveReadinessMinimized(false)}') &&
    navigate.includes('onMinimize={() => setActiveReadinessMinimized(true)}') &&
    !navigate.includes('activeReadinessSignature') &&
    !navigate.includes('setTimeout(() => {\n      setActiveReadinessMinimized(true);\n    }, 5000)'),
  'Active Expedition Readiness should open and close only from explicit user controls, not route/readiness recalculation effects.',
);
assert(
  strip.includes('ROUTE PREVIEW READINESS') &&
    strip.includes('ACTIVE EXPEDITION READINESS') &&
    strip.includes('Open Brief') &&
    strip.includes('Start Guidance'),
  'NavigateReadinessStrip must render preview and active readiness affordances.',
);
[
  'Weather window changed',
  'Daylight margin dropping',
  'Offline package incomplete',
  'Bailout distance increasing',
  'Camp confidence limited',
  'Fuel/power margins reduced',
].forEach((copy) => {
  assert(strip.includes(copy), `Active readiness strip is missing live-change copy: ${copy}`);
});
assert(
  strip.includes('ECS recommends review before departure.'),
  'HOLD state must warn without hard-blocking guidance from the compact strip.',
);
assert(
  !/AI says/i.test(strip) &&
    !/legal campsite/i.test(strip) &&
    !/safe as an absolute/i.test(strip) &&
    !/OnX/i.test(strip),
  'Navigate readiness copy must avoid generic AI, legal guarantees, absolute safety, and OnX comparison.',
);

console.log('Navigate readiness integration checks passed.');
