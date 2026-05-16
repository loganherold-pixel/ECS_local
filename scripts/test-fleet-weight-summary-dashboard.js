const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function between(source, start, end, message) {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `${message}: missing start marker`);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `${message}: missing end marker`);
  return source.slice(startIndex, endIndex + end.length);
}

const fleet = read('app', '(tabs)', 'fleet.tsx');
const weightPanel = read('components', 'weight-dashboard', 'WeightDashboardPanel.tsx');

const weightModal = between(
  fleet,
  '<ECSModalShell\n        visible={weightSummaryModalVisible}',
  '</ECSModalShell>',
  'Weight Summary modal',
);

includes(
  fleet,
  'onWeightSummary={() => handleOpenWeightSummaryModal(model.vehicle)}',
  'Vehicle card Weight Summary action should open the direct modal handler.',
);
includes(weightModal, 'maxHeightFraction={0.94}', 'Weight Summary modal should use the current near-full-height ECS shell configuration.');
includes(weightModal, 'minHeightFraction={0.88}', 'Weight Summary modal should keep a tall, stable minimum height.');
includes(weightModal, 'topClearanceOverride={Math.max(insets.top + 8, 8)}', 'Weight Summary modal should respect top safe-area chrome.');
includes(weightModal, 'bottomClearanceOverride={dockClearance}', 'Weight Summary modal should respect bottom tab/dock clearance.');
includes(weightModal, 'scrollable={false}', 'Weight Summary modal should not create an outer scrolling sheet.');
includes(weightModal, 'bodyStyle={s.weightSummaryModalBody}', 'Weight Summary modal should use the flex body style.');
includes(weightModal, 'contentContainerStyle={s.weightSummaryModalContent}', 'Weight Summary modal should use the flex content style.');
includes(weightModal, '<WeightDashboardPanel', 'Weight Summary modal should render the weight dashboard directly.');
notIncludes(weightModal, '<ECSOverlayFooter>', 'Weight Summary modal should rely on the shell close control, not a short footer sheet.');

includes(weightPanel, 'REAL-TIME DASHBOARD', 'Weight panel should present the single real-time dashboard surface.');
includes(weightPanel, '<CGVisualization', 'Weight panel should keep the Center of Gravity container.');
includes(weightPanel, 'vehicleType={dashData.vehicleType}', 'Weight panel should pass selected vehicle type into the COG visual.');
includes(weightPanel, 'supportGrid', 'Weight panel should include compact supporting values.');
includes(weightPanel, 'selectFleetVehicleState', 'Weight panel should use the canonical Fleet vehicle state selector.');
includes(weightPanel, 'fleetState.operatingWeight.dashboardData', 'Weight panel should render the shared Fleet operating-weight dashboard data.');
notIncludes(weightPanel, 'adaptLegacyVehicleToFleetVehicle', 'Weight panel should not rebuild a parallel vehicle profile model.');
includes(weightPanel, 'TOTAL OPERATING WEIGHT', 'Weight panel should label the real operating weight directly.');
includes(weightPanel, 'PAYLOAD MARGIN', 'Weight panel should expose payload margin when GVWR is known.');
notIncludes(weightPanel, "(['overview', 'zones', 'stability']", 'Weight panel should remove the old internal tab registry.');
notIncludes(weightPanel, 'activeSection', 'Weight panel should not keep old tab state.');
notIncludes(weightPanel, 'ZoneWeightBars', 'Weight panel should remove the old Zone Distribution container.');
notIncludes(weightPanel, 'TiltRiskPanel', 'Weight panel should remove the old Tilt Risk Analysis container.');
notIncludes(weightPanel, 'WeightComparisonCard', 'Weight panel should remove redundant comparison cards from this fixed dashboard.');
notIncludes(weightPanel, 'computeWeightComparison', 'Weight panel should not compute the old comparison flow.');
notIncludes(weightPanel, 'computeWeightDashboard(', 'Weight panel should not use the legacy wizard-selection operating-weight calculation.');

const cgVisual = read('components', 'weight-dashboard', 'CGVisualization.tsx');
includes(cgVisual, 'resolveVehicleProfileKind', 'COG visual should select a top-down profile by vehicle type.');
includes(cgVisual, 'TopDownVehicleProfile', 'COG visual should render a vehicle-profile silhouette component.');
includes(cgVisual, 'TopDownVehicleFallbackProfile', 'COG visual should use the ECS drawn top-down vehicle profile.');
notIncludes(cgVisual, 'import { Image', 'COG visual should not depend on a generic image asset.');
notIncludes(cgVisual, "require('../../assets/images/Attitude_Truck_Silhouette.png')", 'COG visual should not depend on the retired top-down image asset.');
includes(cgVisual, 'top: `${FRONT_AXLE_X * 100}%`', 'COG visual should remap front axle overlay to the vertical vehicle asset axis.');
includes(cgVisual, 'top: `${cgLongitudinalPercent}%`', 'COG marker should remap longitudinal COG onto the vertical vehicle asset axis.');
includes(cgVisual, 'left: `${cgLateralPercent}%`', 'COG marker should keep lateral COG on the horizontal vehicle asset axis.');
includes(cgVisual, 'vehicleProfileSilhouette', 'COG visual should use a profile silhouette, not the old rectangle body.');
includes(cgVisual, 'cgResult.yCG', 'COG marker should use live lateral COG when available.');
notIncludes(cgVisual, 'cabSection', 'COG visual should not render the old CAB rectangle section.');
notIncludes(cgVisual, 'midSection', 'COG visual should not render the old MID rectangle section.');
notIncludes(cgVisual, 'rearSection', 'COG visual should not render the old REAR rectangle section.');
notIncludes(cgVisual, 'vehicleBody', 'COG visual should not use the old generic box body.');

console.log('Fleet Weight Summary dashboard assertions passed.');
