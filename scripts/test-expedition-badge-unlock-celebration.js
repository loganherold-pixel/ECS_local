const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

global.localStorage = (() => {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
})();

const originalLoad = Module._load;
Module._load = function loadBadgeTestDependency(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Easing: {
        out: (value) => value,
        in: (value) => value,
        cubic: 'cubic',
        quad: 'quad',
        exp: 'exp',
      },
      Platform: {
        OS: 'web',
        select(options) {
          return options.web ?? options.default;
        },
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
require.extensions['.png'] = function loadBadgeArtwork(module, filename) {
  module.exports = { uri: filename };
};

const {
  buildBadgeUnlockEvents,
  getBadgeUnlockPresentationModel,
  planBadgeUnlockPresentations,
} = require(path.join(root, 'lib', 'expedition', 'badgeUnlockPresentation.ts'));
const {
  createBadgeUnlockQueueStore,
} = require(path.join(root, 'lib', 'expedition', 'badgeUnlockQueueStore.ts'));
const {
  resolveBadgeUnlockSafety,
} = require(path.join(root, 'lib', 'expedition', 'badgeUnlockSafety.ts'));
const {
  safelyFireBadgeUnlockHaptic,
} = require(path.join(root, 'lib', 'expedition', 'badgeUnlockEffects.ts'));
const {
  getBadgeDefinition,
} = require(path.join(root, 'lib', 'expedition', 'expeditionBadgeRegistry.ts'));

function earnedBadge(id, {
  tripId = `trip-${id}`,
  unlockedAt = '2026-07-14T12:00:00.000Z',
  progressCurrent = null,
} = {}) {
  const definition = getBadgeDefinition(id);
  assert(definition, `Fixture badge should exist: ${id}`);
  return {
    ...definition,
    unlockedAt,
    unlockedTripId: tripId,
    progressCurrent,
    progressTarget: definition.progressTarget,
    updatedAt: unlockedAt ?? definition.createdAt,
  };
}

function memoryStorage(seed = null) {
  const values = new Map();
  if (seed) values.set('ecs_badge_unlock_presentations_v1', seed);
  return {
    values,
    async read(key) {
      return values.get(key) ?? null;
    },
    async write(key, value) {
      if (value == null) values.delete(key);
      else values.set(key, value);
    },
    async remove(key) {
      values.delete(key);
    },
  };
}

function firstEvent(id = 'first-expedition') {
  return buildBadgeUnlockEvents([earnedBadge(id)], [])[0];
}

async function main() {
  // 1. A newly earned event creates one queued presentation.
  const storage = memoryStorage();
  const store = createBadgeUnlockQueueStore({ storage });
  const event = firstEvent();
  assert(event, 'A persisted earned badge should adapt into an unlock event.');
  assert.strictEqual(await store.enqueue([event]), 1);
  assert.strictEqual(store.getSnapshot().queue.length, 1);

  // 2. Presented IDs survive hydration and reject replay.
  const active = store.beginNext();
  assert(active);
  assert.strictEqual(store.markActivePresented(active.id), true);
  assert.strictEqual(store.completeActive(active.id), true);
  await store.flushPersistence();
  const restoredStore = createBadgeUnlockQueueStore({ storage });
  await restoredStore.initialize();
  assert.strictEqual(restoredStore.getSnapshot().queue.length, 0);
  assert.strictEqual(await restoredStore.enqueue([event]), 0, 'Presented event must not replay.');

  // 3. Two or three events remain sequential and subsequent reveals are shorter.
  const sequentialEvents = [
    firstEvent('first-expedition'),
    firstEvent('trail-veteran'),
    firstEvent('miles-500'),
  ];
  const sequentialPlan = planBadgeUnlockPresentations(sequentialEvents);
  assert.strictEqual(sequentialPlan.length, 3);
  assert.strictEqual(sequentialPlan[0].kind, 'badge');
  assert.strictEqual(sequentialPlan[0].mode, 'full');
  assert.strictEqual(sequentialPlan[1].mode, 'short');
  assert.strictEqual(sequentialPlan[2].mode, 'short');

  // 4. Registry rarity drives the presentation theme and the component resolves canonical artwork.
  const rareModel = getBadgeUnlockPresentationModel(
    planBadgeUnlockPresentations([firstEvent('trail-veteran')])[0],
    false,
  );
  assert.strictEqual(rareModel.rarity, 'rare');
  assert.strictEqual(rareModel.theme.highlight, '#5AC8FA');
  const { getExpeditionBadgeArtwork } = require(path.join(root, 'assets', 'expedition-badges', 'index.ts'));
  const rareArtwork = getExpeditionBadgeArtwork('trail-veteran');
  assert(rareArtwork.uri.endsWith(path.join('rare', 'trail-veteran.png')));
  const celebrationSource = fs.readFileSync(
    path.join(root, 'components', 'badges', 'BadgeUnlockCelebration.tsx'),
    'utf8',
  );
  assert(celebrationSource.includes('getExpeditionBadgeArtwork(model.badgeId)'));

  // 5. Locked hidden records cannot become presentation events.
  const lockedHidden = earnedBadge('weather-gambler', { unlockedAt: null });
  assert.strictEqual(buildBadgeUnlockEvents([lockedHidden], []).length, 0);

  // 6. An earned hidden badge receives the secret reveal without exposing it while locked.
  const hiddenModel = getBadgeUnlockPresentationModel(
    planBadgeUnlockPresentations([firstEvent('weather-gambler')])[0],
    false,
  );
  assert.strictEqual(hiddenModel.isHidden, true);
  assert.strictEqual(hiddenModel.headline, 'SECRET BADGE DISCOVERED');

  // 7. Repeatable records keep every event and use the 700-1000 ms improvement treatment.
  const priorRecord = earnedBadge('highest-point-yet', {
    tripId: 'record-trip-1',
    unlockedAt: '2026-07-13T12:00:00.000Z',
    progressCurrent: 8100,
  });
  const improvedRecord = earnedBadge('highest-point-yet', {
    tripId: 'record-trip-2',
    progressCurrent: 9200,
  });
  const repeatEvent = buildBadgeUnlockEvents([improvedRecord], [priorRecord])[0];
  assert.strictEqual(repeatEvent.firstUnlock, false);
  assert.strictEqual(repeatEvent.previousValue, 8100);
  assert.strictEqual(repeatEvent.currentValue, 9200);
  const repeatPlan = planBadgeUnlockPresentations([repeatEvent]);
  const repeatModel = getBadgeUnlockPresentationModel(repeatPlan[0], false);
  assert.strictEqual(repeatPlan[0].mode, 'record');
  assert.strictEqual(repeatModel.headline, 'PERSONAL RECORD IMPROVED');
  assert(repeatModel.animation.durationMs >= 700 && repeatModel.animation.durationMs <= 1000);

  // 8. Reduced motion retains content while removing movement, rotation, and overshoot.
  const reducedModel = getBadgeUnlockPresentationModel(sequentialPlan[0], true);
  assert.strictEqual(reducedModel.animation.animateScale, false);
  assert.strictEqual(reducedModel.animation.scaleOvershoot, false);
  assert.strictEqual(reducedModel.animation.animateRotation, false);
  assert.strictEqual(reducedModel.animation.animateParticleMotion, false);
  assert.strictEqual(reducedModel.animation.animateSweep, false);

  // 9. Active navigation, expeditions, incidents, and critical routes defer blocking UI.
  const safeInput = {
    appIsActive: true,
    navigationIsActive: false,
    expeditionIsActive: false,
    incidentOrRecoveryIsActive: false,
    criticalInteractionIsActive: false,
    pathname: '/dashboard',
  };
  assert.strictEqual(resolveBadgeUnlockSafety(safeInput).blockingPresentationAllowed, true);
  assert.strictEqual(resolveBadgeUnlockSafety({ ...safeInput, navigationIsActive: true }).reason, 'active_navigation');
  assert.strictEqual(resolveBadgeUnlockSafety({ ...safeInput, expeditionIsActive: true }).reason, 'active_expedition');
  assert.strictEqual(resolveBadgeUnlockSafety({ ...safeInput, incidentOrRecoveryIsActive: true }).reason, 'active_incident_or_recovery');
  assert.strictEqual(resolveBadgeUnlockSafety({ ...safeInput, pathname: '/offline-incident-packet' }).reason, 'critical_route');
  assert.strictEqual(resolveBadgeUnlockSafety({ ...safeInput, pathname: '/login' }).reason, 'unavailable_surface');
  const deferredStore = createBadgeUnlockQueueStore({ storage: memoryStorage() });
  await deferredStore.enqueue([firstEvent('recovery-ready')]);
  const deferredBanner = deferredStore.claimDeferredBanner();
  assert(deferredBanner, 'Critical field state should be able to claim a nonblocking banner.');
  assert.strictEqual(deferredStore.getSnapshot().queue.length, 1, 'Compact banner must not consume the full reveal.');
  assert.strictEqual(deferredStore.getSnapshot().active, null, 'Critical field state must not activate a blocking reveal.');

  // 10. Completing one item advances to the next item without parallel activation.
  const sequentialStore = createBadgeUnlockQueueStore({ storage: memoryStorage() });
  await sequentialStore.enqueue(sequentialEvents);
  const first = sequentialStore.beginNext();
  assert(first);
  assert.strictEqual(sequentialStore.beginNext(), null, 'Only one presentation may be active.');
  sequentialStore.completeActive(first.id);
  const second = sequentialStore.beginNext();
  assert(second && second.id !== first.id);

  // 11. Haptic failures are contained and never alter queue state.
  assert.strictEqual(
    await safelyFireBadgeUnlockHaptic(async () => {
      throw new Error('haptic unavailable');
    }),
    false,
  );
  assert.strictEqual(sequentialStore.getSnapshot().active.item.id, second.id);

  // 12. Four or more events choose the highest rarity and collapse the remainder.
  const batchEvents = [
    firstEvent('first-expedition'),
    firstEvent('trail-veteran'),
    firstEvent('miles-500'),
    firstEvent('miles-1000'),
    firstEvent('weather-shift'),
  ];
  const batchPlan = planBadgeUnlockPresentations(batchEvents);
  assert.strictEqual(batchPlan.length, 2);
  assert.strictEqual(batchPlan[0].kind, 'badge');
  assert.strictEqual(batchPlan[0].badgeId, 'miles-1000');
  assert.strictEqual(batchPlan[1].kind, 'summary');
  assert.strictEqual(batchPlan[1].additionalCount, 4);

  // Wiring: one root host, reconciliation suppression, critical banner, and catalog action.
  const rootLayoutSource = fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8');
  const badgeStoreSource = fs.readFileSync(path.join(root, 'lib', 'expedition', 'expeditionBadgeStore.ts'), 'utf8');
  const hostSource = fs.readFileSync(path.join(root, 'components', 'badges', 'BadgeUnlockCelebrationHost.tsx'), 'utf8');
  assert.strictEqual((rootLayoutSource.match(/<BadgeUnlockQueueProvider>/g) ?? []).length, 1);
  assert(badgeStoreSource.includes('evaluateBadgesForCompletedTripNow(tripId, false)'));
  assert(badgeStoreSource.includes('void enqueueBadgeUnlockEvents(presentationEvents).catch'));
  assert(
    badgeStoreSource.indexOf('await saveSnapshot({') < badgeStoreSource.indexOf('void enqueueBadgeUnlockEvents(presentationEvents).catch'),
    'Badge persistence must complete before presentation enqueue and presentation failure must remain nonblocking.',
  );
  assert(hostSource.includes('Full reveal will wait until field operations are clear.'));
  assert(hostSource.includes("router.push('/expedition-badges'"));

  console.log('Expedition badge unlock celebration checks passed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Module._load = originalLoad;
  });
