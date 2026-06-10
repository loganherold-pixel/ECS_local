import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import { getMapboxTokenSync } from '../../lib/mapConfig';
import {
  getRouteOverlayQaFixtures,
  type RouteOverlayQaFixture,
  type RouteOverlayQaValidationRow,
} from '../../lib/map/routeOverlayQaFixtures';
import { TACTICAL } from '../../lib/theme';
import MapRenderer from './MapRenderer';

function rowColor(state: RouteOverlayQaValidationRow['state']): string {
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
  fixture: RouteOverlayQaFixture;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={onPress}
      style={[styles.scenarioButton, selected && styles.scenarioButtonSelected]}
      accessibilityRole="button"
      accessibilityLabel={`Route overlay QA ${fixture.title}`}
    >
      <Text style={styles.scenarioTitle}>{fixture.title}</Text>
      <Text style={styles.scenarioMeta}>
        {fixture.geometryClass.replace(/_/g, ' ')} / {fixture.expectedOverlayState.replace(/_/g, ' ')}
      </Text>
    </TouchableOpacity>
  );
}

function ValidationRows({ fixture }: { fixture: RouteOverlayQaFixture }) {
  return (
    <View style={styles.validationGrid}>
      {fixture.validationRows.map((row) => (
        <View key={`${fixture.id}-${row.label}`} style={styles.validationRow}>
          <View style={[styles.validationDot, { backgroundColor: rowColor(row.state) }]} />
          <View style={styles.validationTextGroup}>
            <Text style={styles.validationLabel}>{row.label}</Text>
            <Text style={[styles.validationValue, { color: rowColor(row.state) }]}>{row.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function RouteOverlayFixtureQaScreen() {
  const fixtures = useMemo(() => getRouteOverlayQaFixtures(), []);
  const [selectedId, setSelectedId] = useState(fixtures[0]?.id ?? null);
  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedId) ?? fixtures[0] ?? null;
  const mapboxToken = useMemo(() => getMapboxTokenSync(), []);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Route Overlay QA' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>DEV ONLY - ROUTE OVERLAY QA</Text>
          <Text style={styles.title}>Native Mapbox route overlay fixture</Text>
          <Text style={styles.body}>
            NON-PRODUCTION QA FIXTURE. This screen renders local deterministic route geometry classes through
            the ECS MapRenderer path. It does not mutate route catalogs, saved itineraries, Active Trip, Offline
            Packet, Badge, Convoy, Fleet, telemetry, or provider state.
          </Text>
        </View>

        <View style={styles.guardrailGrid}>
          {[
            ['Production access', 'Redirected'],
            ['Providers', 'Not called'],
            ['Saved routes', 'Untouched'],
            ['Active Trip', 'Untouched'],
            ['Offline Packet', 'Untouched'],
            ['Badge / Convoy', 'Untouched'],
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
              selected={fixture.id === selectedFixture?.id}
              onPress={() => setSelectedId(fixture.id)}
            />
          ))}
        </View>

        {selectedFixture ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailKicker}>{selectedFixture.geometryClass.replace(/_/g, ' ')}</Text>
            <Text style={styles.detailTitle}>{selectedFixture.title}</Text>
            <Text style={styles.body}>{selectedFixture.description}</Text>
            <Text style={styles.disclosure}>{selectedFixture.disclosure}</Text>

            <View style={styles.mapFrame}>
              {mapboxToken ? (
                <MapRenderer
                  points={selectedFixture.mapPoints}
                  waypoints={selectedFixture.waypoints}
                  routeColor={selectedFixture.routeColor}
                  routeRenderMode={selectedFixture.id === 'preview_route_geometry' ? 'preview' : 'selected'}
                  mapboxToken={mapboxToken}
                  hasToken={!!mapboxToken}
                  interactive
                  surfaceMode="compact"
                />
              ) : (
                <View style={styles.mapFallback}>
                  <Text style={styles.mapFallbackTitle}>Mapbox token unavailable</Text>
                  <Text style={styles.mapFallbackText}>
                    The fixture is ready, but native route-line evidence requires a configured public Mapbox token.
                    No provider call was made from this QA screen.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Overlay</Text>
                <Text style={styles.summaryValue}>{selectedFixture.expectedOverlayState.replace(/_/g, ' ')}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Geometry</Text>
                <Text style={styles.summaryValue}>
                  {selectedFixture.normalized.status} / {selectedFixture.normalized.pointCount} pts
                </Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Authority</Text>
                <Text style={styles.summaryValue}>{selectedFixture.authorityLabel}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Source</Text>
                <Text style={styles.summaryValue}>{selectedFixture.sourceLabel}</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Authority copy</Text>
            <Text style={styles.notice}>{selectedFixture.authorityNotice}</Text>

            <Text style={styles.sectionLabel}>Validation rows</Text>
            <ValidationRows fixture={selectedFixture} />
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
            Capture screenshots, UI dumps, and logcat locally under ignored .qa or qa-evidence folders. Commit only
            concise markdown summaries after reviewing for sensitive route, location, account, device, or token data.
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
    fontSize: 22,
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
  mapFrame: {
    height: 320,
    marginTop: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#080B08',
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  mapFallbackTitle: {
    color: '#F4F7F1',
    fontSize: 14,
    fontWeight: '900',
  },
  mapFallbackText: {
    marginTop: 8,
    color: '#B8C4B0',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  summaryCell: {
    minWidth: '46%',
    flexGrow: 1,
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.028)',
  },
  summaryLabel: {
    color: '#8C9988',
    fontSize: 9,
    fontWeight: '900',
  },
  summaryValue: {
    marginTop: 4,
    color: '#F4F7F1',
    fontSize: 12,
    fontWeight: '800',
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
  validationTextGroup: {
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

