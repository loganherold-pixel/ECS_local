import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeIcon as Ionicons } from '../SafeIcon';

type QaStatus = 'available' | 'disabled' | 'shadow' | 'unknown' | 'stale' | 'cached' | 'missing';

type CampOpsVisualQaScenario = {
  id: string;
  title: string;
  regionLabel: string;
  routeLabel: string;
  recommended: string;
  backup: string;
  emergency: string;
  status: string;
  decisionPoint: string;
  sourceState: string;
  providerState: string;
  offlineState: string;
  warnings: string[];
  reasons: string[];
  chips: { label: string; value: string; status: QaStatus }[];
};

const QA_SCENARIOS: CampOpsVisualQaScenario[] = [
  {
    id: 'on_time_normal_route',
    title: 'On-time normal route',
    regionLabel: 'Region label: Northern Nevada internal QA cell',
    routeLabel: 'Route label: On-time normal day',
    recommended: 'Recommended endpoint: Planned Ridge Camp',
    backup: 'Backup endpoint: Basin Pullout Camp',
    emergency: 'Emergency fallback: Highway Exit Staging',
    status: 'Recommendation available',
    decisionPoint: 'Decision point: not required for on-time route',
    sourceState: 'Source transparency: visible with label-only fixture data',
    providerState: 'Provider influence: shadow/unknown',
    offlineState: 'Offline mode: online planning fixture',
    reasons: ['Planned camp remains within arrival window.', 'Resource margins remain comfortable.', 'Legal confidence label is visible.'],
    warnings: ['Provider quality is fixture-backed.', 'Manual feedback required after visual QA.'],
    chips: [
      { label: 'Legal confidence', value: 'Medium fixture', status: 'unknown' },
      { label: 'Closure status', value: 'Unknown', status: 'unknown' },
      { label: 'AI assist', value: 'Disabled', status: 'disabled' },
    ],
  },
  {
    id: 'two_hour_delay_after_sunset',
    title: 'Two-hour delay after sunset',
    regionLabel: 'Region label: Sierra foothills delayed-day cell',
    routeLabel: 'Route label: Two-hour delay endpoint review',
    recommended: 'Recommended endpoint: Closer Valley Camp',
    backup: 'Backup endpoint: Roadside Legal Pullout',
    emergency: 'Emergency fallback: Developed Campground Exit',
    status: 'Endpoint recommendation available',
    decisionPoint: 'Decision point: divert before final technical section',
    sourceState: 'Source transparency: sunset and late-arrival warnings visible',
    providerState: 'Provider influence: shadow/unknown',
    offlineState: 'Offline mode: cached route labels only',
    reasons: ['Planned scenic camp is downgraded after sunset.', 'Closer camp has lower late-arrival risk.', 'Emergency fallback is present.'],
    warnings: ['Original planned camp is not primary.', 'Stale or missing source warnings must remain visible.'],
    chips: [
      { label: 'Late arrival', value: 'High caution', status: 'stale' },
      { label: 'Sunset margin', value: 'After dark', status: 'stale' },
      { label: 'Decision point', value: 'Visible', status: 'available' },
    ],
  },
  {
    id: 'trailer_full_size_turnaround',
    title: 'Trailer/full-size turnaround',
    regionLabel: 'Region label: High desert turnaround cell',
    routeLabel: 'Route label: Trailer access review',
    recommended: 'Recommended endpoint: Wide Wash Camp',
    backup: 'Backup endpoint: Gravel Lot Fallback',
    emergency: 'Emergency fallback: Paved Exit Staging',
    status: 'Recommendation available',
    decisionPoint: 'Decision point: last trailer turnaround before narrow road',
    sourceState: 'Source transparency: trailer confidence shown as limited',
    providerState: 'Provider influence: shadow/unknown',
    offlineState: 'Offline mode: online fixture',
    reasons: ['Known narrow dead-end camp is downgraded.', 'Trailer-safe endpoint is highlighted.', 'Emergency fallback favors access certainty.'],
    warnings: ['Road width is not invented.', 'Unknown turnaround is not treated as good.'],
    chips: [
      { label: 'Trailer', value: 'Caution', status: 'unknown' },
      { label: 'Turnaround', value: 'Limited confidence', status: 'unknown' },
      { label: 'Provider mode', value: 'Shadow only', status: 'shadow' },
    ],
  },
  {
    id: 'low_fuel_margin',
    title: 'Low fuel margin',
    regionLabel: 'Region label: Low-service resupply cell',
    routeLabel: 'Route label: Low fuel endpoint review',
    recommended: 'Recommended endpoint: Exit-adjacent Camp',
    backup: 'Backup endpoint: Service Road Camp',
    emergency: 'Emergency fallback: Town/Exit Staging',
    status: 'Recommendation available',
    decisionPoint: 'Decision point: last fuel/resupply opportunity',
    sourceState: 'Source transparency: service status unknown shown',
    providerState: 'Provider influence: shadow/unknown',
    offlineState: 'Offline mode: service data unknown',
    reasons: ['Remote scenic camp is downgraded.', 'Resource debt is visible.', 'Resupply-friendly role is visible.'],
    warnings: ['Operating hours unknown.', 'Fuel service is not promised open.'],
    chips: [
      { label: 'Fuel margin', value: 'Tight', status: 'stale' },
      { label: 'Service status', value: 'Unknown', status: 'unknown' },
      { label: 'Telemetry', value: 'Disabled', status: 'disabled' },
    ],
  },
  {
    id: 'low_water_next_day',
    title: 'Low water next-day concern',
    regionLabel: 'Region label: Dry route water-margin cell',
    routeLabel: 'Route label: Low water endpoint review',
    recommended: 'Recommended endpoint: Exit Toward Water',
    backup: 'Backup endpoint: Short Day Camp',
    emergency: 'Emergency fallback: Developed Water Stop',
    status: 'Recommendation available',
    decisionPoint: 'Decision point: decide before passing reliable exit',
    sourceState: 'Source transparency: water source confidence visible',
    providerState: 'Provider influence: shadow/unknown',
    offlineState: 'Offline mode: cached source warning',
    reasons: ['Next-day water margin is part of recommendation.', 'Unknown refill remains unknown.', 'Group demand is visible as label-only context.'],
    warnings: ['Water refill is not guaranteed.', 'Heat risk may increase water concern when known.'],
    chips: [
      { label: 'Water margin', value: 'Tight', status: 'cached' },
      { label: 'Refill status', value: 'Unknown', status: 'unknown' },
      { label: 'Community publishing', value: 'Disabled', status: 'disabled' },
    ],
  },
  {
    id: 'offline_cached_source_data',
    title: 'Offline cached source data',
    regionLabel: 'Region label: Offline cached source cell',
    routeLabel: 'Route label: Cached-source endpoint review',
    recommended: 'Recommended endpoint: Cached Legal Camp',
    backup: 'Backup endpoint: Cached Backup Pullout',
    emergency: 'Emergency fallback: Cached Exit',
    status: 'Endpoint recommendation available',
    decisionPoint: 'Decision point: available from cached route labels',
    sourceState: 'Source transparency: cached/stale warnings visible',
    providerState: 'Provider influence: shadow/unknown',
    offlineState: 'Offline mode: cached source data',
    reasons: ['Cached data is usable with lower confidence.', 'Unknowns remain visible.', 'Manual verification reminder is shown.'],
    warnings: ['Never show cached data as current.', 'Stale warnings must remain visible in field mode.'],
    chips: [
      { label: 'Offline', value: 'Cached', status: 'cached' },
      { label: 'Weather freshness', value: 'Stale', status: 'stale' },
      { label: 'AI assist', value: 'Disabled', status: 'disabled' },
    ],
  },
  {
    id: 'offline_no_cache_missing_source',
    title: 'Offline no-cache / missing sources',
    regionLabel: 'Region label: Offline no-cache cell',
    routeLabel: 'Route label: Missing-source endpoint review',
    recommended: 'Recommended endpoint: Unknown-confidence Camp',
    backup: 'Backup endpoint: Label-only Pullout',
    emergency: 'Emergency fallback: Last Known Exit',
    status: 'Recommendation with unknown confidence',
    decisionPoint: 'Decision point: unavailable without route geometry',
    sourceState: 'Source transparency: missing critical data visible',
    providerState: 'Provider influence: unknown',
    offlineState: 'Offline mode: no cached source data',
    reasons: ['Missing data lowers confidence.', 'Unknown fields stay unknown.', 'Emergency fallback favors access labels only.'],
    warnings: ['Legal status unknown.', 'Closure status unknown.', 'Fire restrictions unknown.'],
    chips: [
      { label: 'Offline', value: 'No cache', status: 'missing' },
      { label: 'Legal confidence', value: 'Unknown', status: 'unknown' },
      { label: 'Closure status', value: 'Unknown', status: 'unknown' },
    ],
  },
  {
    id: 'stale_closure_weather_fire_service',
    title: 'Stale closure/weather/fire/service',
    regionLabel: 'Region label: Stale-source transparency cell',
    routeLabel: 'Route label: Stale source review',
    recommended: 'Recommended endpoint: Caution Camp',
    backup: 'Backup endpoint: Lower-risk Camp',
    emergency: 'Emergency fallback: Exit Staging',
    status: 'Recommendation with stale-source caution',
    decisionPoint: 'Decision point: reassess before entering stale-source area',
    sourceState: 'Source transparency: closure, weather, fire, service stale states visible',
    providerState: 'Provider influence: shadow/unknown',
    offlineState: 'Offline mode: degraded/cached fixture',
    reasons: ['Stale categories are visible.', 'Confidence is reduced.', 'Warnings appear without AI output.'],
    warnings: ['Closure data stale.', 'Weather stale.', 'Fire restrictions unknown.', 'Service status unknown.'],
    chips: [
      { label: 'Closure', value: 'Stale', status: 'stale' },
      { label: 'Weather', value: 'Stale', status: 'stale' },
      { label: 'Fire restrictions', value: 'Unknown', status: 'unknown' },
    ],
  },
  {
    id: 'legacy_result_differs',
    title: 'Legacy result differs from CampOps endpoint',
    regionLabel: 'Region label: Legacy coexistence cell',
    routeLabel: 'Route label: Search result conflict review',
    recommended: 'Recommended endpoint: Operational Camp B',
    backup: 'Backup endpoint: Operational Camp C',
    emergency: 'Emergency fallback: Exit Staging',
    status: 'CampOps recommendation differs from top search result',
    decisionPoint: 'Decision point: explain downgrade before choosing legacy top result',
    sourceState: 'Source transparency: legacy list is search results, not endpoint recommendation',
    providerState: 'Provider influence: shadow/unknown',
    offlineState: 'Offline mode: online fixture',
    reasons: ['CampOps cards are operational recommendations.', 'Legacy list remains available.', 'Downgraded planned camp copy is visible.'],
    warnings: ['Legacy top result must not be labeled best when CampOps disagrees.', 'Review coexistence copy on small screens.'],
    chips: [
      { label: 'Legacy list', value: 'Search results', status: 'available' },
      { label: 'CampOps status', value: 'Endpoint recommendation', status: 'available' },
      { label: 'Provider mode', value: 'Shadow only', status: 'shadow' },
    ],
  },
  {
    id: 'private_debrief_no_community',
    title: 'Private debrief without community publishing',
    regionLabel: 'Region label: Private debrief QA cell',
    routeLabel: 'Route label: Debrief privacy review',
    recommended: 'Recommended endpoint: Debriefed Camp Label',
    backup: 'Backup endpoint: Private Backup Label',
    emergency: 'Emergency fallback: Private Exit Label',
    status: 'Private debrief capture reminder',
    decisionPoint: 'Decision point: not applicable after camp visit',
    sourceState: 'Source transparency: personal feedback remains private',
    providerState: 'Provider influence: shadow/unknown',
    offlineState: 'Offline mode: private local capture allowed',
    reasons: ['Feedback can improve personal review.', 'Structured fields are separate from notes.', 'Community publishing stays disabled.'],
    warnings: ['No private debrief notes in shared reports.', 'No raw photo refs in public-safe output.', 'Manual feedback reminder is visible.'],
    chips: [
      { label: 'Debrief visibility', value: 'Private', status: 'available' },
      { label: 'Community publishing', value: 'Disabled', status: 'disabled' },
      { label: 'Telemetry', value: 'Disabled', status: 'disabled' },
    ],
  },
];

function chipColor(status: QaStatus): string {
  switch (status) {
    case 'available':
      return '#8BC34A';
    case 'disabled':
      return '#90A4AE';
    case 'shadow':
      return '#64B5F6';
    case 'stale':
    case 'cached':
      return '#FFB74D';
    case 'missing':
    case 'unknown':
    default:
      return '#E0E0E0';
  }
}

export function CampOpsVisualQaScreen() {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'CampOps Visual QA' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>DEV ONLY - CAMPOPS VISUAL QA</Text>
          <Text style={styles.title}>Closed field-test visual states</Text>
          <Text style={styles.body}>
            Fixture-only route for Android/device QA evidence collection. No real users, routes, providers,
            telemetry, community publishing, or AI output are used.
          </Text>
        </View>

        <View style={styles.guardrailGrid}>
          {[
            ['AI assist', 'Disabled'],
            ['Telemetry', 'Disabled'],
            ['Community publishing', 'Disabled'],
            ['Provider influence', 'Shadow/unknown'],
            ['Location data', 'Labels only'],
            ['Manual feedback', 'Required'],
          ].map(([label, value]) => (
            <View key={label} style={styles.guardrail}>
              <Text style={styles.guardrailLabel}>{label}</Text>
              <Text style={styles.guardrailValue}>{value}</Text>
            </View>
          ))}
        </View>

        {QA_SCENARIOS.map((scenario, index) => (
          <View key={scenario.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconShell}>
                <Ionicons name="trail-sign-outline" size={14} color="#8BC34A" />
              </View>
              <View style={styles.cardTitleGroup}>
                <Text style={styles.cardIndex}>STATE {index + 1}</Text>
                <Text style={styles.cardTitle}>{scenario.title}</Text>
              </View>
            </View>

            <View style={styles.labelBlock}>
              <Text style={styles.labelText}>{scenario.regionLabel}</Text>
              <Text style={styles.labelText}>{scenario.routeLabel}</Text>
            </View>

            <View style={styles.roleStack}>
              <RoleRow label="Recommended" value={scenario.recommended} color="#8BC34A" />
              <RoleRow label="Backup" value={scenario.backup} color="#64B5F6" />
              <RoleRow label="Emergency fallback" value={scenario.emergency} color="#FFB74D" />
            </View>

            <View style={styles.statusBlock}>
              {[scenario.status, scenario.decisionPoint, scenario.sourceState, scenario.providerState, scenario.offlineState].map((item) => (
                <Text key={item} style={styles.statusText}>- {item}</Text>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Top reasons</Text>
            {scenario.reasons.slice(0, 3).map((reason) => (
              <View key={reason} style={styles.reasonRow}>
                <Ionicons name="checkmark-circle-outline" size={11} color="#8BC34A" />
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ))}

            <Text style={styles.sectionLabel}>Warnings</Text>
            {scenario.warnings.slice(0, 4).map((warning) => (
              <View key={warning} style={styles.warningRow}>
                <Ionicons name="alert-circle-outline" size={11} color="#FFB74D" />
                <Text style={styles.warningText}>{warning}</Text>
              </View>
            ))}

            <View style={styles.chipRow}>
              {scenario.chips.map((chip) => (
                <View key={`${scenario.id}-${chip.label}`} style={[styles.chip, { borderColor: chipColor(chip.status) + '66' }]}>
                  <Text style={styles.chipLabel}>{chip.label}</Text>
                  <Text style={[styles.chipValue, { color: chipColor(chip.status) }]}>{chip.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Manual feedback reminder</Text>
          <Text style={styles.footerText}>
            Capture privacy-safe feedback after each device run. Use labels only. Do not include precise
            coordinates, private user IDs, vehicle identifiers, raw provider payloads, raw AI prompts, or private
            debrief notes.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function RoleRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.roleRow}>
      <View style={[styles.roleDot, { backgroundColor: color }]} />
      <View style={styles.roleTextGroup}>
        <Text style={styles.roleLabel}>{label}</Text>
        <Text style={styles.roleValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050806',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.28)',
    backgroundColor: 'rgba(139,195,74,0.08)',
  },
  kicker: {
    color: '#8BC34A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  title: {
    marginTop: 5,
    color: '#F4F7F1',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0,
  },
  body: {
    marginTop: 8,
    color: '#B8C4B0',
    fontSize: 13,
    lineHeight: 18,
  },
  guardrailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  guardrail: {
    minWidth: '30%',
    flexGrow: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  guardrailLabel: {
    color: '#8C9988',
    fontSize: 10,
    fontWeight: '700',
  },
  guardrailValue: {
    marginTop: 3,
    color: '#F4F7F1',
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    marginBottom: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#10140F',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  iconShell: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.35)',
    backgroundColor: 'rgba(139,195,74,0.09)',
  },
  cardTitleGroup: {
    flex: 1,
  },
  cardIndex: {
    color: '#8BC34A',
    fontSize: 9,
    fontWeight: '800',
  },
  cardTitle: {
    color: '#F4F7F1',
    fontSize: 16,
    fontWeight: '800',
  },
  labelBlock: {
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    marginBottom: 10,
  },
  labelText: {
    color: '#B8C4B0',
    fontSize: 12,
    lineHeight: 17,
  },
  roleStack: {
    gap: 7,
    marginBottom: 10,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  roleDot: {
    width: 8,
    height: 8,
    marginTop: 4,
    borderRadius: 4,
  },
  roleTextGroup: {
    flex: 1,
  },
  roleLabel: {
    color: '#8C9988',
    fontSize: 10,
    fontWeight: '800',
  },
  roleValue: {
    color: '#F4F7F1',
    fontSize: 13,
    lineHeight: 18,
  },
  statusBlock: {
    marginVertical: 8,
    gap: 3,
  },
  statusText: {
    color: '#CFD8C8',
    fontSize: 12,
    lineHeight: 17,
  },
  sectionLabel: {
    marginTop: 9,
    marginBottom: 5,
    color: '#8BC34A',
    fontSize: 10,
    fontWeight: '800',
  },
  reasonRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  reasonText: {
    flex: 1,
    color: '#DDE7D6',
    fontSize: 12,
    lineHeight: 17,
  },
  warningRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  warningText: {
    flex: 1,
    color: '#FFD7A3',
    fontSize: 12,
    lineHeight: 17,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  chip: {
    minWidth: '30%',
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipLabel: {
    color: '#8C9988',
    fontSize: 9,
    fontWeight: '800',
  },
  chipValue: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '800',
  },
  footer: {
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.28)',
    backgroundColor: 'rgba(255,183,77,0.08)',
  },
  footerTitle: {
    color: '#FFB74D',
    fontSize: 13,
    fontWeight: '900',
  },
  footerText: {
    marginTop: 6,
    color: '#E6D6C0',
    fontSize: 12,
    lineHeight: 17,
  },
});
