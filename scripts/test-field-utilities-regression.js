const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const quickActionsSource = fs.readFileSync(path.join(root, 'components', 'QuickActionsSheet.tsx'), 'utf8');
const commandDockSource = fs.readFileSync(path.join(root, 'components', 'CommandDock.tsx'), 'utf8');
const modalShellSource = fs.readFileSync(path.join(root, 'components', 'ECSModalShell.tsx'), 'utf8');
const emergencyDataSource = fs.readFileSync(path.join(root, 'components', 'emergency', 'EmergencyData.ts'), 'utf8');
const recoveryDataSource = fs.readFileSync(path.join(root, 'components', 'emergency', 'RecoveryProtocolData.ts'), 'utf8');
const recoveryDetailSource = fs.readFileSync(path.join(root, 'components', 'emergency', 'RecoveryProtocolDetail.tsx'), 'utf8');
const fieldUseDetailSource = fs.readFileSync(path.join(root, 'components', 'emergency', 'FieldUseProtocolDetail.tsx'), 'utf8');

function normalize(source) {
  return source.replace(/\r\n/g, '\n');
}

function assertIncludes(source, fragment, message) {
  assert.ok(normalize(source).includes(normalize(fragment)), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!normalize(source).includes(normalize(fragment)), message);
}

function blockBetween(source, startFragment, endFragment) {
  const normalizedSource = normalize(source);
  const start = normalizedSource.indexOf(normalize(startFragment));
  assert.notStrictEqual(start, -1, `Expected source to include ${startFragment}`);
  const end = normalizedSource.indexOf(normalize(endFragment), start);
  assert.notStrictEqual(end, -1, `Expected source to include ${endFragment}`);
  return normalizedSource.slice(start, end);
}

function styleBlock(source, styleName) {
  const normalizedSource = normalize(source);
  const start = normalizedSource.indexOf(`${styleName}: {`);
  assert.notStrictEqual(start, -1, `Expected style block ${styleName} to exist.`);
  const closeMatch = normalizedSource.slice(start).match(/\n\s*},/);
  assert.ok(closeMatch, `Expected style block ${styleName} to close.`);
  return normalizedSource.slice(start, start + closeMatch.index);
}

function unique(values) {
  return Array.from(new Set(values));
}

function protocolObjects(source) {
  const body = blockBetween(source, 'export const EMERGENCY_PROTOCOLS: EmergencyProtocol[] = [', '\n];');
  return body
    .split(/\n  \{\n/)
    .slice(1)
    .map((chunk) => `{\n${chunk}`);
}

function recoveryProtocolObjects(source) {
  const body = blockBetween(source, 'export const RECOVERY_PROTOCOLS: RecoveryProtocol[] = [', '\n];');
  return body
    .split(/\n  \{\n/)
    .slice(1)
    .map((chunk) => `{\n${chunk}`);
}

const protocolBlocks = protocolObjects(emergencyDataSource);
assert.ok(protocolBlocks.length >= 6, 'Quick Protocol tests should cover every configured emergency protocol.');
assertIncludes(emergencyDataSource, 'beforeYouPull: string[];', 'Emergency protocol data should expose compact before-action chips.');
assertIncludes(emergencyDataSource, 'stepCards: {', 'Emergency protocol data should expose concise numbered step cards.');
['steps', 'warnings', 'equipment', 'avoid', 'completionCheck', 'doNot'].forEach((fieldName) => {
  assertIncludes(
    emergencyDataSource,
    `${fieldName}: string[];`,
    `Emergency protocol data should expose ${fieldName}.`,
  );
});
protocolBlocks.forEach((block) => {
  const titleMatch = block.match(/title: '([^']+)'/);
  const title = titleMatch ? titleMatch[1] : 'Emergency protocol';
  ['beforeYouPull:', 'stepCards:', 'doNot:', 'equipment:', 'steps:', 'warnings:', 'avoid:', 'completionCheck:', 'recognize:', 'stabilize:', 'evacuateIf:'].forEach((fieldName) => {
    assert.ok(block.includes(fieldName), `${title} should include ${fieldName}`);
  });
});
const recoveryProtocolBlocks = recoveryProtocolObjects(recoveryDataSource);
assert.strictEqual(recoveryProtocolBlocks.length, 6, 'Vehicle Recovery Protocols should define exactly six recovery cards.');

const protocolIds = protocolBlocks.map((block) => {
  const match = block.match(/id: '([^']+)'/);
  assert.ok(match, 'Every protocol must have a stable id.');
  return match[1];
});

const badgeImages = protocolBlocks.map((block) => {
  const match = block.match(/badgeImage: '([^']+)'/);
  assert.ok(match, 'Every protocol card must declare a badgeImage.');
  return match[1];
});

// Dashboard long-press Quick Actions / Protocols entry.
assertIncludes(
  commandDockSource,
  'onLongPress={() => {\n                    dismissFirstLaunchHint();\n                    openQuickActions();\n                  }}',
  'Dashboard long-press should open Field Utilities / Quick Actions.',
);
assertIncludes(
  commandDockSource,
  '<QuickActionsSheet\n        visible={quickActionsVisible}\n        onClose={closeQuickActions}',
  'CommandDock should mount QuickActionsSheet and close it back to the parent Dashboard flow.',
);
assertIncludes(
  commandDockSource,
  'const QUICK_ACTIONS_NAV_LOCK_MS = 650;',
  'Field Utilities should define a short dock-navigation lock to absorb late long-press/tap races.',
);
assertIncludes(
  commandDockSource,
  'quickActionsVisible || Date.now() < quickActionsNavLockUntilRef.current',
  'CommandDock should ignore tab navigation while Field Utilities is open or during the gesture lock window.',
);
assertIncludes(
  commandDockSource,
  "console.log('[FIELD_UTILITIES] dock_navigation_ignored_quick_actions_active'",
  'Ignored dock navigation while Field Utilities is open should be visible in development diagnostics.',
);
assertIncludes(
  commandDockSource,
  "pointerEvents={hideForDashboardExpanded || quickActionsVisible ? 'none' : 'auto'}",
  'CommandDock should not receive touch events behind the Field Utilities modal.',
);
assertIncludes(
  quickActionsSource,
  "label: 'Emergency Protocol',",
  'Field Utilities main menu should expose Emergency Protocol.',
);
assertIncludes(
  quickActionsSource,
  "onPress: () => openFieldUtilityAction('protocols')",
  'Protocols action should use the shared Field Utilities action transition.',
);

// Protocol image restoration.
assert.strictEqual(
  unique(badgeImages).length,
  badgeImages.length,
  'Protocol cards must not all render the same placeholder image.',
);
badgeImages.forEach((image) => {
  assert.ok(/^https?:\/\//.test(image), `Protocol badge image should be a real asset URL: ${image}`);
  assert.ok(!/placeholder/i.test(image), `Protocol badge image should not point at a placeholder: ${image}`);
});
assertIncludes(
  quickActionsSource,
  'const protocolCardImage = protocol.image ?? protocol.fieldUtilityImage ?? protocol.badgeImage;',
  'Field Utilities protocol cards should prefer canonical local protocol images when available.',
);
assertIncludes(
  quickActionsSource,
  "const protocolCardSource = typeof protocolCardImage === 'string' ? { uri: protocolCardImage } : protocolCardImage;",
  'Protocol cards should support both bundled image assets and existing remote URLs.',
);
assertIncludes(
  quickActionsSource,
  '<Image\n          source={protocolCardSource}\n          style={styles.protocolActionImage}\n          resizeMode="cover"',
  'Protocol cards should use the resolved protocol image source as a cover background.',
);
[
  "fieldUtilityImage: require('../../assets/images/safety-protocols/severe_bleeding.png')",
  "fieldUtilityImage: require('../../assets/images/safety-protocols/heat_stroke.png')",
  "fieldUtilityImage: require('../../assets/images/safety-protocols/impalement.png')",
  "fieldUtilityImage: require('../../assets/images/safety-protocols/vehicle_rollover.png')",
].forEach((fragment) => {
  assertIncludes(emergencyDataSource, fragment, `Expected protocol image mapping: ${fragment}`);
});
['severe_bleeding.png', 'heat_stroke.png', 'impalement.png', 'vehicle_rollover.png'].forEach((assetName) => {
  assert.ok(
    fs.existsSync(path.join(root, 'assets', 'images', 'safety-protocols', assetName)),
    `Expected bundled Field Utilities protocol asset ${assetName}.`,
  );
});
for (const protocolId of ['hypothermia', 'altitude-sickness']) {
  const block = protocolBlocks.find((entry) => entry.includes(`id: '${protocolId}'`));
  assert.ok(block, `Expected protocol ${protocolId}.`);
  assert.ok(!block.includes('fieldUtilityImage'), `${protocolId} should keep its existing image mapping unchanged.`);
}
const protocolImageStyle = styleBlock(quickActionsSource, 'protocolActionImage');
assertIncludes(protocolImageStyle, '...StyleSheet.absoluteFillObject', 'Protocol image should fill the card.');
assertIncludes(protocolImageStyle, 'top: -10', 'Protocol image should overscan the top edge to avoid exposed card background.');
assertIncludes(protocolImageStyle, 'left: -10', 'Protocol image should overscan the left edge to avoid exposed card background.');
assertIncludes(protocolImageStyle, 'bottom: -10', 'Protocol image should overscan the bottom edge to avoid exposed card background.');
assertIncludes(protocolImageStyle, 'right: -10', 'Protocol image should overscan the right edge to avoid exposed card background.');
assertIncludes(protocolImageStyle, 'transform: [{ scale: 1.08 }]', 'Protocol image should scale inside the clipped card to prevent exposed inner edges.');
const protocolCardStyle = styleBlock(quickActionsSource, 'protocolActionCard');
assertIncludes(protocolCardStyle, "overflow: 'hidden'", 'Protocol card should clip the full-card image to the container.');
assertIncludes(
  quickActionsSource,
  '<View style={styles.protocolActionScrim} />',
  'Protocol cards should keep a scrim so text remains visible over images.',
);
assertIncludes(
  quickActionsSource,
  '<View style={styles.protocolActionFallback}>',
  'Protocol cards should render a graceful local fallback if a card image cannot load.',
);
assertIncludes(
  quickActionsSource,
  'getProtocolFallbackIconName(protocol.id)',
  'Protocol image fallback should include a protocol icon, not blank space.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'protocolActionFallback'),
  "backgroundColor: 'rgba(5,8,10,0.92)'",
  'Protocol fallback should keep a dark ECS card background.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'protocolActionTitle'),
  'textShadowColor',
  'Protocol card titles should remain legible on image backgrounds.',
);

// Quick Protocol detail fixed page behavior.
assertIncludes(
  quickActionsSource,
  'const openProtocolDetail = useCallback((protocol: ProtocolDefinition) => {',
  'Selecting a quick protocol should use a dedicated detail opener.',
);
assertIncludes(
  quickActionsSource,
  'setSelectedProtocol(protocol);',
  'Selecting a protocol should preserve the chosen protocol for the detail page.',
);
assertIncludes(
  quickActionsSource,
  "activeView: 'protocolDetail'",
  'Selecting a protocol should transition to the protocol detail view.',
);
protocolIds.forEach((id) => {
  assertIncludes(
    quickActionsSource,
    'protocols.map((protocol) => (',
    `Protocol ${id} should be covered by the shared protocol card map.`,
  );
});
assertIncludes(
  quickActionsSource,
  'protocols = EMERGENCY_PROTOCOLS',
  'ProtocolActionGrid should keep Field Stabilization Protocols as the default card set.',
);
assertIncludes(
  quickActionsSource,
  "label: 'Recovery Protocol',",
  'Operational Shortcuts should expose Recovery Protocol as a sibling action.',
);
assertIncludes(
  quickActionsSource,
  "onPress: () => openFieldUtilityAction('recoveryProtocols')",
  'Recovery Protocol should use the shared Field Utilities action transition.',
);
assertIncludes(
  quickActionsSource,
  "renderPanelIntro('Vehicle Recovery Protocols', 'Tap any card for common recovery guidance.')",
  'Recovery Protocol should open the Vehicle Recovery Protocols panel.',
);
assertIncludes(
  quickActionsSource,
  'protocols={RECOVERY_PROTOCOLS}',
  'Vehicle Recovery Protocols should render the dedicated recovery protocol card set.',
);
assertIncludes(
  recoveryDataSource,
  'export type ProtocolDefinition = EmergencyProtocol & {',
  'Recovery data should use a shared protocol definition shape instead of JSX-only card data.',
);
['steps', 'warnings', 'equipment', 'avoid', 'completionCheck', 'doNot'].forEach((fieldName) => {
  assertIncludes(
    recoveryDataSource,
    `${fieldName}: string[];`,
    `Recovery protocol data should expose ${fieldName}.`,
  );
});
assertIncludes(recoveryDataSource, 'beforeYouPull: string[];', 'Recovery protocol data should expose compact before-pull chips.');
assertIncludes(recoveryDataSource, 'stepCards:', 'Recovery protocol data should expose concise numbered step cards.');
[
  ['Winch Recovery', 'Fixed-anchor self-recovery'],
  ['Vehicle-Assisted Pull', 'Recover using a second vehicle'],
  ['Deadman Anchor Recovery', 'Winch without a tree or fixed anchor'],
  ['Snatch Block Redirect', 'Redirect pull angle or increase force'],
  ['Kinetic Rope Recovery', 'Momentum-assisted soft-terrain extraction'],
  ['Multi-Vehicle Recovery', 'Coordinated extraction with multiple rigs'],
].forEach(([title, subtitle]) => {
  const block = recoveryProtocolBlocks.find((entry) => entry.includes(`title: '${title}'`));
  assert.ok(block, `Expected recovery protocol card ${title}.`);
  assert.ok(block.includes(`subtitle: '${subtitle}'`), `Expected subtitle for ${title}: ${subtitle}`);
  ['beforeYouPull:', 'stepCards:', 'doNot:', 'equipment:', 'steps:', 'warnings:', 'avoid:', 'completionCheck:', 'recognize:', 'stabilize:', 'evacuateIf:'].forEach((fieldName) => {
    assert.ok(block.includes(fieldName), `${title} should include ${fieldName}`);
  });
});
assertIncludes(
  recoveryDataSource,
  "beforeYouPull: ['Inspect anchor', 'Use rated point', 'Clear line path', 'Use line damper', 'Agree signals']",
  'Winch Recovery should use the requested before-pull checklist.',
);
assertIncludes(
  recoveryDataSource,
  "{ title: 'Choose anchor', instruction: 'Select a strong tree, rock, or fixed recovery point.' }",
  'Winch Recovery should use the requested first step.',
);
assertIncludes(
  recoveryDataSource,
  "'Do not stand near a loaded line.'",
  'Winch Recovery should include the requested Do Not warning.',
);
assertIncludes(
  recoveryDataSource,
  "completionCheck: ['Vehicle is stable.', 'Line and shackles are inspected.', 'Anchor strap is recovered.']",
  'Winch Recovery should use the requested completion checks.',
);
assertIncludes(
  recoveryDataSource,
  "{ title: 'Assign recovery lead', instruction: 'One person controls timing and commands.' }",
  'Multi-Vehicle Recovery should use the requested first step.',
);
assertIncludes(
  quickActionsSource,
  "import RecoveryProtocolDetail from './emergency/RecoveryProtocolDetail';",
  'Recovery protocol detail should be rendered by the compact recovery detail component.',
);
assertIncludes(
  quickActionsSource,
  'if (!isRecoveryProtocol(selectedProtocol)) {',
  'Recovery detail should guard against non-recovery protocol selections.',
);
assertIncludes(
  quickActionsSource,
  '<RecoveryProtocolDetail protocol={selectedProtocol} />',
  'Recovery card taps should open the compact recovery detail panel.',
);
assertIncludes(
  recoveryDetailSource,
  "beforeLabel: 'BEFORE YOU PULL'",
  'Recovery detail should configure the compact Before You Pull strip.',
);
assertIncludes(
  recoveryDetailSource,
  'beforeItems: protocol.beforeYouPull',
  'Recovery detail should pass before-pull checklist chips into the shared guide.',
);
assertIncludes(
  recoveryDetailSource,
  'stepCards: protocol.stepCards',
  'Recovery detail should pass numbered step cards into the shared guide.',
);
assertIncludes(
  recoveryDetailSource,
  'warningItems: protocol.doNot',
  'Recovery detail should pass Do Not warnings into the shared guide.',
);
assertIncludes(
  recoveryDetailSource,
  'completionItems: protocol.completionCheck',
  'Recovery detail should pass completion checks into the shared guide.',
);
assertIncludes(
  fieldUseDetailSource,
  "protocol.beforeItems.slice(0, 5).map",
  'Recovery detail should cap before-pull checklist chips.',
);
assertIncludes(
  fieldUseDetailSource,
  "protocol.stepCards.slice(0, 6).map",
  'Recovery detail should render a compact numbered step sequence.',
);
assertIncludes(
  fieldUseDetailSource,
  '<Text style={[styles.stepNumberText, { color: protocol.accentColor }]}>{index + 1}</Text>',
  'Recovery detail should use large numbered rows.',
);
assertIncludes(
  fieldUseDetailSource,
  "const warningLabel = protocol.warningLabel ?? 'DO NOT';",
  'Recovery detail should include a compact Do Not warning section.',
);
assertIncludes(
  fieldUseDetailSource,
  'const warningItems = useMemo(() => protocol.warningItems.slice(0, 4), [protocol.warningItems]);',
  'Recovery detail should render the dedicated Do Not warnings.',
);
assertIncludes(
  fieldUseDetailSource,
  "const completionLabel = protocol.completionLabel ?? 'COMPLETION CHECK';",
  'Recovery detail should include completion checks.',
);
assertIncludes(
  fieldUseDetailSource,
  '<Image source={protocol.image}',
  'Recovery detail should use a small protocol image thumbnail or banner.',
);
assertIncludes(
  fieldUseDetailSource,
  'accessibilityRole="header"',
  'Recovery protocol title should be exposed as a heading.',
);
assertIncludes(
  fieldUseDetailSource,
  'maxWidth: 720',
  'Recovery detail content should keep a bounded ECS panel width on larger screens.',
);
assertIncludes(
  fieldUseDetailSource,
  'bounces={false}',
  'Recovery detail should use controlled internal scrolling without bouncey long-page behavior.',
);
assertIncludes(
  fieldUseDetailSource,
  'nestedScrollEnabled',
  'Recovery detail should keep scrolling contained inside the detail body on small phones.',
);
assertIncludes(
  styleBlock(fieldUseDetailSource, 'thumb'),
  'height: 62',
  'Recovery detail image should stay below the requested phone banner maximum.',
);
assertIncludes(
  styleBlock(fieldUseDetailSource, 'stepRow'),
  'minHeight: 46',
  'Recovery step rows should stay dense and field-readable.',
);
[
  'recovery_winch.png',
  'recovery_vehicle_assisted_pull.png',
  'recovery_deadman_anchor.png',
  'recovery_snatch_block_redirect.png',
  'recovery_kinetic_rope.png',
  'recovery_multi_vehicle.png',
].forEach((assetName) => {
  assert.ok(
    fs.existsSync(path.join(root, 'assets', 'images', 'protocols', 'recovery', assetName)),
    `Expected bundled Recovery Protocol asset ${assetName}.`,
  );
  assertIncludes(
    recoveryDataSource,
    `require('../../assets/images/protocols/recovery/${assetName}')`,
    `Recovery Protocol should import ${assetName}.`,
  );
});
assert.ok(!/https?:\/\//.test(recoveryDataSource), 'Recovery Protocol data should not depend on remote images.');
assertIncludes(
  recoveryDataSource,
  "badgeImage: 'local:winch-recovery'",
  'Recovery Protocol card badges should use local-only identifiers when needed.',
);
assertIncludes(
  quickActionsSource,
  "activeView === 'protocols' ||" ,
  'Protocol list should share fixed static body behavior.',
);
assertIncludes(
  quickActionsSource,
  "activeView === 'recoveryProtocols' ||",
  'Recovery protocol list should share fixed static body behavior.',
);
assertIncludes(
  quickActionsSource,
  'recoveryProtocolDetailActive;',
  'Recovery protocol detail should share fixed static body behavior.',
);
assertIncludes(
  quickActionsSource,
  'const commsStaticActive = activeView === \'emergencyComms\';',
  'Emergency Comms should opt into fixed body behavior.',
);
assertIncludes(
  quickActionsSource,
  'const fixedStaticActive = protocolStaticActive || commsStaticActive;',
  'Fixed Field Utilities screens should share a single page-scroll guard.',
);
assertIncludes(
  quickActionsSource,
  'scrollable={!fixedStaticActive}',
  'Protocol and Emergency Comms screens should disable normal page-level scrolling.',
);
assertIncludes(
  quickActionsSource,
  'bodyStyle={protocolStaticActive ? styles.quickProtocolStaticBody : commsStaticActive ? styles.quickCommsStaticBody : undefined}',
  'Protocol and Emergency Comms screens should use fixed-body sizing.',
);
assertIncludes(
  quickActionsSource,
  'contentContainerStyle={fixedStaticActive ? styles.sheetStaticContent : styles.sheetScrollContentMain}',
  'Protocol and Emergency Comms screens should use a fixed static content container.',
);
assertNotIncludes(
  quickActionsSource,
  'protocolActionNumber',
  'Field Utilities protocol cards should not render or style visible step numbers.',
);
assertNotIncludes(
  quickActionsSource,
  'protocolActionGlyph',
  'Field Utilities protocol cards should not render or style the tiny top-right glyph.',
);
assertNotIncludes(
  quickActionsSource,
  'protocolActionFooter',
  'Field Utilities protocol cards should not need a cluttered footer row to remain tappable.',
);
assertIncludes(
  quickActionsSource,
  'styles.protocolDetailPanelBody',
  'Protocol detail should render inside the fixed detail panel body.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'protocolsPanelBody'),
  'minHeight: 0',
  'Protocol list body should fit inside the fixed shell without creating a scroll surface.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'protocolActionGrid'),
  'alignContent: \'space-between\'',
  'Protocol cards should use a fixed two-column by three-row grid.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'protocolActionCard'),
  "height: '31.2%'",
  'Each protocol card should have a fixed row height so all six cards fit without scrolling.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'protocolActionCard'),
  "width: '48.5%'",
  'Each protocol card should fit the fixed two-column layout.',
);
assertIncludes(
  quickActionsSource,
  '<View style={styles.protocolActionCopy}>',
  'Protocol title and description should be grouped in a clean top-left copy block.',
);
assertIncludes(
  quickActionsSource,
  '<FieldUseProtocolDetail protocol={buildEmergencyFieldUseGuide(selectedProtocol)} />',
  'Emergency protocol detail should render through the shared field-use guide component.',
);
assertIncludes(
  quickActionsSource,
  'beforeItems: protocol.beforeYouPull',
  'Emergency protocol detail must use normalized before-action guide data.',
);
assertIncludes(
  quickActionsSource,
  'stepCards: protocol.stepCards',
  'Emergency protocol detail must use normalized numbered field-use steps.',
);
assertIncludes(
  quickActionsSource,
  'warningItems: protocol.doNot',
  'Emergency protocol detail must use normalized warning data.',
);
assertIncludes(
  quickActionsSource,
  'completionItems: protocol.completionCheck',
  'Emergency protocol detail must use normalized completion checks.',
);
assertNotIncludes(
  quickActionsSource,
  'protocolDangerSection',
  'Protocol detail sections should not rely on a one-off Evacuate-only surface class.',
);
assertIncludes(
  fieldUseDetailSource,
  "warningLabel = protocol.warningLabel ?? 'DO NOT'",
  'Emergency and recovery warnings should use the shared warning treatment.',
);
assertIncludes(
  fieldUseDetailSource,
  "backgroundColor: 'rgba(239,83,80,0.08)'",
  'Shared field-use warning block should keep restrained emergency warning tint.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'protocolDetailPanelBody'),
  'minHeight: 0',
  'Protocol detail body should be allowed to fit within the fixed shell without clipping.',
);
assertIncludes(
  quickActionsSource,
  '<ScrollView\n        style={styles.commsEntryScroller}',
  'Emergency Comms should scroll only inside each frequencies/signals/emergency numbers list.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'commsPanelBody'),
  'minHeight: 0',
  'Emergency Comms fixed body should fit within the shell without creating a page scroll surface.',
);
assertIncludes(
  styleBlock(quickActionsSource, 'commsReferenceGrid'),
  'flex: 1',
  'Emergency Comms reference grid should consume fixed screen space above coordinates.',
);
assertIncludes(
  quickActionsSource,
  '<View style={styles.coordinatesActionRow}>',
  'Emergency Comms coordinates and copy action should sit on one horizontal row.',
);
assertIncludes(
  quickActionsSource,
  '<Text style={styles.secondaryBtnText}>COPY</Text>',
  'Emergency Comms copy coordinates action should be compact and right-aligned with coordinates.',
);
assertIncludes(
  quickActionsSource,
  'Long press to edit frequencies, signals, or emergency numbers.',
  'Emergency Comms should show one consolidated edit advisory at the base.',
);
assertNotIncludes(
  quickActionsSource,
  '<Text style={styles.commsHint}>Long press to edit</Text>',
  'Emergency Comms should not repeat long-press hints inside each container.',
);
assertIncludes(
  styleBlock(fieldUseDetailSource, 'scroll'),
  'minHeight: 0',
  'Shared field-use guide scroll region should fit within the fixed shell without clipping critical content.',
);
assertIncludes(
  quickActionsSource,
  "if (activeView === 'protocolDetail') {\n      openFieldUtilityAction('protocols');\n      return;\n    }",
  'Back from protocol detail should return to Protocols, not close the whole panel.',
);

// Redundant Back row removal and remaining shell controls.
['Quick Note', 'Emergency Comms', 'Weather', 'Team Ping'].forEach((title) => {
  assertIncludes(
    quickActionsSource,
    `renderPanelIntro('${title}'`,
    `${title} should use the shared child screen header intro.`,
  );
});
assertNotIncludes(quickActionsSource, 'styles.backBtn', 'Field Utilities child screens must not render the old Back row.');
assertNotIncludes(quickActionsSource, 'styles.backText', 'Field Utilities child screens must not style the old Back row.');
assertNotIncludes(quickActionsSource, '<Text style={styles.backText}>Back</Text>', 'Extra Back row label should not return.');
assertIncludes(
  quickActionsSource,
  'onBack={mainPanelActive ? undefined : handleShellBack}',
  'Child views should keep the shell-level arrow control.',
);
assertIncludes(
  modalShellSource,
  '<Ionicons name="arrow-back"',
  'The shared shell should still render the child back arrow.',
);
assertIncludes(
  modalShellSource,
  '<Ionicons name="close"',
  'The shared shell should still render the X close control.',
);

// Shared Field Utilities navigation model.
assertIncludes(quickActionsSource, 'type FieldUtilitiesView =', 'Field Utilities should use an explicit view-state type.');
assertIncludes(quickActionsSource, 'type FieldUtilitiesState = {', 'Field Utilities should use a normalized state object.');
assertIncludes(quickActionsSource, 'isOpen: boolean;', 'Field Utilities state should include panel open state.');
assertIncludes(quickActionsSource, 'activeView: FieldUtilitiesView;', 'Field Utilities state should include active view.');
assertIncludes(quickActionsSource, "type FieldUtilitiesReturnTarget = 'dashboard' | 'quickActions' | 'map' | string;", 'Field Utilities should define supported return targets.');
assertIncludes(quickActionsSource, 'returnTarget?: FieldUtilitiesReturnTarget;', 'Field Utilities state should preserve a return target.');
['openFieldUtilities', 'closeFieldUtilities', 'openFieldUtilityAction', 'closeFieldUtilityAction'].forEach((handler) => {
  assertIncludes(quickActionsSource, `const ${handler} = useCallback`, `${handler} should be a shared navigation handler.`);
});
assertNotIncludes(quickActionsSource, 'setActivePanel', 'Field Utilities should not use stale one-off activePanel transitions.');

[
  "openFieldUtilityAction('quickNote')",
  "openFieldUtilityAction('emergencyComms')",
  "openFieldUtilityAction('intel')",
  "openFieldUtilityAction('team')",
  "openFieldUtilityAction('protocols')",
  "openFieldUtilityAction('recoveryProtocols')",
].forEach((transition) => {
  assertIncludes(quickActionsSource, transition, `Action card should use shared transition ${transition}.`);
});
assertNotIncludes(quickActionsSource, "key: 'bluetooth'", 'Field Utilities should not duplicate the global Bluetooth launcher.');
assertNotIncludes(quickActionsSource, "label: 'Bluetooth'", 'Field Utilities should not render a Bluetooth action tile.');
assertNotIncludes(quickActionsSource, 'openUnifiedBluetoothCommand(router', 'Bluetooth remains available from the global banner, not Field Utilities.');
assertNotIncludes(
  quickActionsSource,
  "openFieldUtilityAction('bluetooth')",
  'Bluetooth should not use the old embedded Field Utilities scanner transition.',
);

const shellCloseBlock = blockBetween(
  quickActionsSource,
  'const handleShellClose = useCallback(() => {',
  'const handleShellBack = useCallback',
);
assertIncludes(
  shellCloseBlock,
  "if (activeView === 'menu') {\n      closeFieldUtilities();\n      return;\n    }",
  'Main Field Utilities X should close the full panel.',
);
assertIncludes(
  shellCloseBlock,
  'closeFieldUtilityAction();',
  'Child Field Utilities X should return to the Field Utilities main menu.',
);

const childCloseBlock = blockBetween(
  quickActionsSource,
  'const closeFieldUtilityAction = useCallback(() => {',
  'const handleShellClose = useCallback',
);
assertIncludes(childCloseBlock, "activeView: 'menu'", 'Child close should return to the Field Utilities menu.');
assertIncludes(childCloseBlock, 'setSelectedProtocol(null);', 'Child close should clear selected protocol state.');
assertIncludes(childCloseBlock, 'setEditingCommsEntry(null);', 'Child close should clear editing state.');

const panelCloseBlock = blockBetween(
  quickActionsSource,
  'const closeFieldUtilities = useCallback(() => {',
  'const openFieldUtilityAction = useCallback',
);
assertIncludes(panelCloseBlock, 'isOpen: false', 'Main X should close Field Utilities.');
assertIncludes(panelCloseBlock, "activeView: 'menu'", 'Main X should reset active child action.');
assertIncludes(panelCloseBlock, 'setNoteText', 'Main X should reset Quick Note state for a clean reopen.');
assertIncludes(panelCloseBlock, 'setSelectedProtocol(null);', 'Main X should clear selected protocol state.');
assertIncludes(panelCloseBlock, 'const nextReturnTarget = fieldUtilitiesState.returnTarget ?? returnTarget;', 'Main X should resolve the current prioritized return target.');
assertIncludes(panelCloseBlock, 'onClose(nextReturnTarget);', 'Main X should return control to Dashboard or the prioritized parent menu.');

const visibleEffectBlock = blockBetween(
  quickActionsSource,
  'useEffect(() => {\n    if (!visible) {',
  '}, [openFieldUtilities, returnTarget, visible]);',
);
assertIncludes(visibleEffectBlock, "activeView: 'menu'", 'Closing Field Utilities should clear stale child view state.');
assertIncludes(visibleEffectBlock, 'openFieldUtilities(returnTarget);', 'Reopening Field Utilities should start at the main menu.');
assertIncludes(
  quickActionsSource,
  "returnTarget = 'dashboard'",
  'Dashboard long-press flow should default the return target to Dashboard.',
);
assertIncludes(
  quickActionsSource,
  'openFieldUtilities(returnTarget);',
  'Field Utilities should support a non-Dashboard prioritized return target when provided.',
);
assertIncludes(
  quickActionsSource,
  'closeGuardKey={activeView}',
  'The shared modal X guard should reset as Field Utilities changes child views.',
);

console.log('Field Utilities regression checks passed.');
