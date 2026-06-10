import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import {
  getProviderOutageQaFixtures,
  type ProviderOutageQaFixture,
  type ProviderOutageQaValidationRow,
} from '../../lib/qa/providerOutageNoResultsFixtures';
import { TACTICAL } from '../../lib/theme';

function statusColor(state: ProviderOutageQaValidationRow['state']): string {
  switch (state) {
    case 'ok':
      return '#8BC34A';
    case 'critical':
      return '#E57373';
    case 'caution':
      return '#FFB74D';
    case 'watch':
      return '#FFD54F';
    case 'non_live':
    default:
      return '#90A4AE';
  }
}

function ScenarioButton({
  fixture,
  selected,
  onPress,
}: {
  fixture: ProviderOutageQaFixture;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={onPress}
      style={[styles.scenarioButton, selected && styles.scenarioButtonSelected]}
      accessibilityRole="button"
      accessibilityLabel={`Provider outage QA ${fixture.title}`}
    >
      <Text style={styles.scenarioTitle}>{fixture.title}</Text>
      <Text style={styles.scenarioMeta}>
        {fixture.provider.surface.replace(/_/g, ' ')} / {fixture.provider.state.replace(/_/g, ' ')}
      </Text>
    </TouchableOpacity>
  );
}

function MetricCell({ label, value, state = 'watch' }: { label: string; value: string; state?: ProviderOutageQaValidationRow['state'] }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: statusColor(state) }]}>{value}</Text>
    </View>
  );
}

function ValidationRows({ rows }: { rows: ProviderOutageQaValidationRow[] }) {
  return (
    <View style={styles.validationGrid}>
      {rows.map((row) => (
        <View key={`${row.label}-${row.value}`} style={styles.validationRow}>
          <View style={[styles.validationDot, { backgroundColor: statusColor(row.state) }]} />
          <View style={styles.validationText}>
            <Text style={styles.validationLabel}>{row.label}</Text>
            <Text style={[styles.validationValue, { color: statusColor(row.state) }]}>{row.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function ProviderOutageFixtureQaScreen() {
  const fixtures = useMemo(() => getProviderOutageQaFixtures(), []);
  const [selectedId, setSelectedId] = useState(fixtures[0]?.id ?? null);
  const selected = fixtures.find((fixture) => fixture.id === selectedId) ?? fixtures[0] ?? null;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Provider Outage QA' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>DEV ONLY - PROVIDER OUTAGE QA</Text>
          <Text style={styles.title}>Provider outage and no-results fixtures</Text>
          <Text style={styles.body}>
            NON-PRODUCTION QA FIXTURE. Providers are not called. This screen renders deterministic outage,
            timeout, no-results, stale-cache, not-requested, weather, route, and bailout states for manual Android
            verification before closed beta.
          </Text>
        </View>

        <View style={styles.guardrailGrid}>
          {[
            ['Production access', 'Redirected'],
            ['Providers', 'Not called'],
            ['Saved trips', 'Untouched'],
            ['Active Trip', 'Untouched'],
            ['Offline Packet', 'Untouched'],
            ['Badge / Team', 'Untouched'],
            ['Fleet', 'Untouched'],
            ['Telemetry', 'Untouched'],
          ].map(([label, value]) => (
            <View key={label} style={styles.guardrail}>
              <Text style={styles.guardrailLabel}>{label}</Text>
              <Text style={styles.guardrailValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.scenarioGrid}>
          {fixtures.map((fixture) => (
            <ScenarioButton
              key={fixture.id}
              fixture={fixture}
              selected={fixture.id === selected?.id}
              onPress={() => setSelectedId(fixture.id)}
            />
          ))}
        </View>

        {selected ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailKicker}>{selected.provider.state.replace(/_/g, ' ')}</Text>
            <Text style={styles.detailTitle}>{selected.title}</Text>
            <Text style={styles.body}>{selected.description}</Text>
            <Text style={styles.disclosure}>{selected.disclosure}</Text>

            <View style={styles.metricGrid}>
              <MetricCell label="Provider surface" value={selected.provider.surface.replace(/_/g, ' ')} state="non_live" />
              <MetricCell label="Trip Builder" value={selected.preTrailState.replace(/_/g, ' ')} state={selected.preTrailState === 'provider_unavailable' ? 'caution' : 'watch'} />
              <MetricCell label="Confidence" value={selected.routeConfidence.label} state="watch" />
              <MetricCell label="Geometry" value={selected.routeGeometry.status} state={selected.routeGeometry.valid ? 'ok' : 'caution'} />
              <MetricCell label="Overlay" value={selected.expectedRouteOverlay.replace(/_/g, ' ')} state={selected.expectedRouteOverlay === 'route_line' ? 'ok' : 'watch'} />
              <MetricCell label="Weather" value={selected.weather.status} state={selected.weather.status === 'unavailable' ? 'caution' : 'watch'} />
            </View>

            <Text style={styles.sectionLabel}>Provider copy</Text>
            <Text style={styles.notice}>{selected.provider.copy}</Text>

            <Text style={styles.sectionLabel}>Trip Builder copy</Text>
            <Text style={styles.notice}>{selected.tripBuilderCopy}</Text>

            <Text style={styles.sectionLabel}>Route / Mapbox copy</Text>
            <Text style={styles.notice}>{selected.routeAuthorityCopy}</Text>

            <Text style={styles.sectionLabel}>Weather copy</Text>
            <Text style={styles.notice}>{selected.weather.copy}</Text>

            <Text style={styles.sectionLabel}>Bailout copy</Text>
            <Text style={styles.notice}>{selected.bailout.copy}</Text>

            <Text style={styles.sectionLabel}>Confidence reasons</Text>
            <View style={styles.reasonGrid}>
              {selected.routeConfidence.reasons.slice(0, 8).map((reason) => (
                <View key={`${selected.id}-${reason.id}`} style={styles.reasonChip}>
                  <Text style={styles.reasonText}>{reason.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Validation</Text>
            <ValidationRows rows={selected.validationRows} />

            <Text style={styles.sectionLabel}>Product isolation</Text>
            <ValidationRows rows={selected.productIsolation} />
          </View>
        ) : (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>Fixture harness unavailable</Text>
            <Text style={styles.body}>This route only renders in development or test mode.</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Native QA capture policy</Text>
          <Text style={styles.footerText}>
            Store screenshots, UI dumps, and logs locally under ignored .qa or qa-evidence folders. Commit only a
            concise markdown summary after checking for sensitive route, location, account, device, or token data.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
  },
  content: {
    padding: 14,
    paddingBottom: 36,
  },
  header: {
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.24)',
    backgroundColor: '#10140F',
  },
  kicker: {
    color: '#8BC34A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  title: {
    marginTop: 5,
    color: '#F4F7F1',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0,
  },
  body: {
    marginTop: 7,
    color: '#B8C4B0',
    fontSize: 12,
    lineHeight: 18,
  },
  guardrailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  guardrail: {
    minWidth: '31%',
    flexGrow: 1,
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  guardrailLabel: {
    color: '#8C9988',
    fontSize: 9,
    fontWeight: '900',
  },
  guardrailValue: {
    marginTop: 4,
    color: '#F4F7F1',
    fontSize: 12,
    fontWeight: '900',
  },
  scenarioGrid: {
    gap: 8,
    marginBottom: 12,
  },
  scenarioButton: {
    padding: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  scenarioButtonSelected: {
    borderColor: 'rgba(139,195,74,0.55)',
    backgroundColor: 'rgba(139,195,74,0.09)',
  },
  scenarioTitle: {
    color: '#F4F7F1',
    fontSize: 13,
    fontWeight: '900',
  },
  scenarioMeta: {
    marginTop: 4,
    color: '#B8C4B0',
    fontSize: 11,
    lineHeight: 15,
  },
  detailCard: {
    padding: 13,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#10140F',
  },
  detailKicker: {
    color: '#8BC34A',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailTitle: {
    marginTop: 4,
    color: '#F4F7F1',
    fontSize: 17,
    fontWeight: '900',
  },
  disclosure: {
    marginTop: 8,
    padding: 8,
    color: '#FFD7A3',
    fontSize: 11,
    lineHeight: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.24)',
    backgroundColor: 'rgba(255,183,77,0.07)',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  metricCell: {
    minWidth: '46%',
    flexGrow: 1,
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.028)',
  },
  metricLabel: {
    color: '#8C9988',
    fontSize: 9,
    fontWeight: '900',
  },
  metricValue: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
  },
  sectionLabel: {
    marginTop: 11,
    marginBottom: 5,
    color: '#8BC34A',
    fontSize: 10,
    fontWeight: '900',
  },
  notice: {
    color: '#DDE7D6',
    fontSize: 12,
    lineHeight: 18,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  reasonChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  reasonText: {
    color: '#F4F7F1',
    fontSize: 11,
    fontWeight: '800',
  },
  validationGrid: {
    gap: 7,
  },
  validationRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.028)',
  },
  validationDot: {
    width: 8,
    height: 8,
    marginTop: 4,
    borderRadius: 4,
  },
  validationText: {
    flex: 1,
  },
  validationLabel: {
    color: '#8C9988',
    fontSize: 9,
    fontWeight: '900',
  },
  validationValue: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
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
