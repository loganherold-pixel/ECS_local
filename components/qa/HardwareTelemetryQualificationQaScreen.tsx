import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import {
  getHardwareTelemetryQaFixtures,
  HARDWARE_TELEMETRY_PROVIDER_INVENTORY,
  HARDWARE_TELEMETRY_TRUTH_RULES,
  type HardwareTelemetryDataState,
  type HardwareTelemetryQaFixture,
} from '../../src/telemetry/hardwareTelemetryQualification';
import { TACTICAL } from '../../lib/theme';

function stateColor(state: HardwareTelemetryDataState | 'ok'): string {
  switch (state) {
    case 'live':
      return '#8BC34A';
    case 'stale':
    case 'manual':
      return '#FFD54F';
    case 'mock':
    case 'demo':
    case 'unsupported':
      return '#90A4AE';
    case 'error':
      return '#EF5350';
    case 'unavailable':
    case 'unknown':
      return '#FFB74D';
    case 'ok':
    default:
      return '#8BC34A';
  }
}

function ScenarioButton({
  fixture,
  selected,
  onPress,
}: {
  fixture: HardwareTelemetryQaFixture;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={onPress}
      style={[styles.scenarioButton, selected && styles.scenarioButtonSelected]}
      accessibilityRole="button"
      accessibilityLabel={`Hardware telemetry QA ${fixture.title}`}
    >
      <Text style={styles.scenarioTitle}>{fixture.title}</Text>
      <Text style={styles.scenarioMeta}>
        {fixture.qualification.providerLabel} / {fixture.qualification.dataState}
      </Text>
    </TouchableOpacity>
  );
}

function Guardrail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.guardrail}>
      <Text style={styles.guardrailLabel}>{label}</Text>
      <Text style={styles.guardrailValue}>{value}</Text>
    </View>
  );
}

function MetricCell({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: HardwareTelemetryDataState | 'ok';
}) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: stateColor(state) }]}>{value}</Text>
    </View>
  );
}

export function HardwareTelemetryQualificationQaScreen() {
  const fixtures = useMemo(() => getHardwareTelemetryQaFixtures(), []);
  const [selectedId, setSelectedId] = useState(fixtures[0]?.id ?? null);
  const selected = fixtures.find((fixture) => fixture.id === selectedId) ?? fixtures[0] ?? null;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Hardware Telemetry QA' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>DEV ONLY - HARDWARE TELEMETRY QA</Text>
          <Text style={styles.title}>Hardware telemetry field qualification</Text>
          <Text style={styles.body}>
            No providers are called. This screen renders deterministic OBD2, EcoFlow, utility sensor,
            manual, stale, mock, demo, unsupported, unavailable, and error states for native QA.
          </Text>
        </View>

        <View style={styles.guardrailGrid}>
          <Guardrail label="Production access" value="Redirected" />
          <Guardrail label="Provider calls" value="None" />
          <Guardrail label="Saved trips" value="Untouched" />
          <Guardrail label="Active Trip" value="Untouched" />
          <Guardrail label="Offline Packet" value="Untouched" />
          <Guardrail label="Badge state" value="Untouched" />
          <Guardrail label="Convoy / Fleet" value="Untouched" />
          <Guardrail label="Location publish" value="None" />
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
            <Text style={styles.detailKicker}>{selected.qualification.dataState}</Text>
            <Text style={styles.detailTitle}>{selected.title}</Text>
            <Text style={styles.body}>{selected.description}</Text>

            <View style={styles.metricGrid}>
              <MetricCell label="Provider" value={selected.qualification.providerLabel} state="ok" />
              <MetricCell label="Surface" value={selected.qualification.surface.replace(/_/g, ' ')} state="ok" />
              <MetricCell label="Connection" value={selected.qualification.connectionState} state={selected.qualification.dataState} />
              <MetricCell label="Data state" value={selected.qualification.dataState} state={selected.qualification.dataState} />
              <MetricCell label="Decoded metrics" value={`${selected.qualification.decodedMetricCount}`} state={selected.qualification.decodedMetricCount > 0 ? 'ok' : selected.qualification.dataState} />
              <MetricCell label="Production ready" value={selected.qualification.productionReady ? 'Yes' : 'No'} state={selected.qualification.productionReady ? 'ok' : 'unavailable'} />
            </View>

            <Text style={styles.sectionLabel}>Truth copy</Text>
            <Text style={styles.notice}>{selected.qualification.truthLabel}</Text>

            <Text style={styles.sectionLabel}>Warning</Text>
            <Text style={styles.notice}>{selected.qualification.warning}</Text>

            <Text style={styles.sectionLabel}>Isolation</Text>
            <View style={styles.validationGrid}>
              {selected.rows.map((row) => (
                <View key={`${selected.id}-${row.label}`} style={styles.validationRow}>
                  <View style={[styles.validationDot, { backgroundColor: stateColor(row.state) }]} />
                  <View style={styles.validationText}>
                    <Text style={styles.validationLabel}>{row.label}</Text>
                    <Text style={[styles.validationValue, { color: stateColor(row.state) }]}>{row.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>Fixture harness unavailable</Text>
            <Text style={styles.body}>This route only renders in development or test mode.</Text>
          </View>
        )}

        <View style={styles.detailCard}>
          <Text style={styles.sectionLabel}>Truth rules</Text>
          {HARDWARE_TELEMETRY_TRUTH_RULES.map((rule) => (
            <Text key={rule} style={styles.ruleText}>- {rule}</Text>
          ))}
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.sectionLabel}>Provider field checklist</Text>
          {HARDWARE_TELEMETRY_PROVIDER_INVENTORY.map((provider) => (
            <View key={provider.id} style={styles.providerBlock}>
              <Text style={styles.providerTitle}>{provider.label}</Text>
              <Text style={styles.providerMeta}>
                {provider.classification.replace(/_/g, ' ')} / {provider.productionGate ? 'Gated' : 'Available as fallback'}
              </Text>
              <Text style={styles.providerCopy}>{provider.knownSafeBehavior}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Native QA capture policy</Text>
          <Text style={styles.footerText}>
            Store screenshots, UI dumps, and logs locally under ignored .qa or qa-evidence folders.
            Commit only a concise markdown summary after checking for device, route, account, token, or location sensitivity.
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
    borderColor: 'rgba(139,195,74,0.72)',
    backgroundColor: 'rgba(139,195,74,0.10)',
  },
  scenarioTitle: {
    color: '#F4F7F1',
    fontSize: 13,
    fontWeight: '900',
  },
  scenarioMeta: {
    marginTop: 4,
    color: '#9AA995',
    fontSize: 11,
    fontWeight: '700',
  },
  detailCard: {
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  detailKicker: {
    color: '#8BC34A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  detailTitle: {
    marginTop: 4,
    color: '#F4F7F1',
    fontSize: 17,
    fontWeight: '900',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  metricCell: {
    minWidth: '31%',
    flexGrow: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.22)',
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
  },
  sectionLabel: {
    marginTop: 14,
    marginBottom: 8,
    color: '#F4F7F1',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  notice: {
    padding: 10,
    color: '#DCE8D7',
    fontSize: 12,
    lineHeight: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  validationGrid: {
    gap: 8,
  },
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  validationDot: {
    width: 8,
    height: 8,
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
    marginTop: 2,
    fontSize: 12,
    fontWeight: '900',
  },
  ruleText: {
    color: '#C9D7C1',
    fontSize: 12,
    lineHeight: 18,
  },
  providerBlock: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  providerTitle: {
    color: '#F4F7F1',
    fontSize: 13,
    fontWeight: '900',
  },
  providerMeta: {
    marginTop: 3,
    color: '#FFD54F',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  providerCopy: {
    marginTop: 6,
    color: '#B8C4B0',
    fontSize: 12,
    lineHeight: 17,
  },
  footer: {
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  footerTitle: {
    color: '#F4F7F1',
    fontSize: 12,
    fontWeight: '900',
  },
  footerText: {
    marginTop: 6,
    color: '#B8C4B0',
    fontSize: 12,
    lineHeight: 18,
  },
});
