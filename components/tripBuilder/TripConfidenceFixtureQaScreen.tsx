import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  getTripConfidenceQaFixtures,
  type TripConfidenceQaFixture,
  type TripConfidenceQaValidationRow,
} from '../../lib/tripBuilder/tripConfidenceQaFixtures';
import type { TripConfidenceReasonTone } from '../../lib/tripBuilder/tripConfidenceSummary';

function toneColor(tone: TripConfidenceReasonTone): string {
  switch (tone) {
    case 'positive':
      return '#8BC34A';
    case 'watch':
      return '#FFB74D';
    case 'caution':
      return '#FF9800';
    case 'critical':
      return '#E57373';
    case 'neutral':
    default:
      return '#90A4AE';
  }
}

function rowColor(state: TripConfidenceQaValidationRow['state']): string {
  switch (state) {
    case 'ok':
      return '#8BC34A';
    case 'critical':
      return '#E57373';
    case 'caution':
      return '#FF9800';
    case 'watch':
      return '#FFB74D';
    case 'unknown':
      return '#CFD8C8';
    case 'non_live':
    default:
      return '#90A4AE';
  }
}

function FixtureCard({ fixture, index }: { fixture: TripConfidenceQaFixture; index: number }) {
  const { summary } = fixture;
  const reasons = summary.reasons.filter((reason) => reason.tone !== 'positive').slice(0, 6);
  const displayedReasons = reasons.length ? reasons : summary.reasons.slice(0, 4);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconShell}>
          <Ionicons name="analytics-outline" size={15} color="#8BC34A" />
        </View>
        <View style={styles.cardTitleGroup}>
          <Text style={styles.cardIndex}>{String(index + 1).padStart(2, '0')} / {fixture.id}</Text>
          <Text style={styles.cardTitle}>{fixture.title}</Text>
        </View>
      </View>

      <Text style={styles.body}>{fixture.description}</Text>
      <Text style={styles.disclosure}>{fixture.disclosure}</Text>

      <View style={styles.summaryBand}>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreLabel}>CATEGORY</Text>
          <Text style={styles.scoreValue}>{summary.label}</Text>
          <Text style={styles.scoreSubline}>Score {summary.score ?? 'unknown'}</Text>
        </View>
        <View style={styles.actionBlock}>
          <Text style={styles.scoreLabel}>NEXT ACTION</Text>
          <Text style={styles.actionText}>{summary.recommendedAction.label}</Text>
        </View>
      </View>

      <View style={styles.routeBlock}>
        <Text style={styles.sectionLabel}>Route State</Text>
        <Text style={styles.statusText}>
          {summary.route.routeName ?? 'Route unknown'} - {summary.route.authorityLabel}
        </Text>
        <Text style={styles.statusMuted}>
          {summary.route.status} / {summary.route.geometryStatus} / {summary.route.geometrySource ?? 'source unknown'}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Fixture Validation</Text>
      <View style={styles.rowGrid}>
        {fixture.validationRows.map((row) => (
          <View key={`${fixture.id}-${row.label}`} style={styles.validationRow}>
            <View style={[styles.rowDot, { backgroundColor: rowColor(row.state) }]} />
            <View style={styles.rowTextGroup}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={[styles.rowValue, { color: rowColor(row.state) }]}>{row.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {summary.keyWarnings.length ? (
        <>
          <Text style={styles.sectionLabel}>Warnings</Text>
          {summary.keyWarnings.map((warning) => (
            <View key={`${fixture.id}-${warning}`} style={styles.reasonRow}>
              <Ionicons name="warning-outline" size={13} color="#FFB74D" />
              <Text style={styles.warningText}>{warning}</Text>
            </View>
          ))}
        </>
      ) : null}

      <Text style={styles.sectionLabel}>Reason Rows</Text>
      {displayedReasons.map((reason) => (
        <View key={`${fixture.id}-${reason.id}`} style={styles.reasonRow}>
          <View style={[styles.reasonDot, { backgroundColor: toneColor(reason.tone) }]} />
          <Text style={styles.reasonText}>{reason.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function TripConfidenceFixtureQaScreen() {
  const fixtures = useMemo(() => getTripConfidenceQaFixtures(), []);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Trip Confidence QA' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>DEV ONLY - TRIP CONFIDENCE QA</Text>
          <Text style={styles.title}>Native edge-state fixture harness</Text>
          <Text style={styles.body}>
            NON-LIVE QA FIXTURE path for Android device checks. These summaries are rendered from local
            deterministic inputs and do not read or modify saved trips, Fleet profiles, providers, environment
            caches, or telemetry devices.
          </Text>
        </View>

        <View style={styles.guardrailGrid}>
          {[
            ['Production access', 'Redirected'],
            ['Saved trips', 'Untouched'],
            ['Fleet profiles', 'Untouched'],
            ['Providers', 'Not called'],
            ['Telemetry devices', 'Not changed'],
            ['Fixture status', 'Non-live'],
          ].map(([label, value]) => (
            <View key={label} style={styles.guardrail}>
              <Text style={styles.guardrailLabel}>{label}</Text>
              <Text style={styles.guardrailValue}>{value}</Text>
            </View>
          ))}
        </View>

        {fixtures.length ? (
          fixtures.map((fixture, index) => (
            <FixtureCard key={fixture.id} fixture={fixture} index={index} />
          ))
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Fixture harness unavailable</Text>
            <Text style={styles.body}>
              This route only renders fixture summaries in dev or test mode.
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>QA boundary</Text>
          <Text style={styles.footerText}>
            Use this route only to verify Trip Confidence edge summaries on native builds. It is not a route
            planner, provider simulator, or hardware simulator.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080B08',
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
    marginBottom: 8,
    gap: 10,
  },
  iconShell: {
    width: 30,
    height: 30,
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
    fontWeight: '900',
    letterSpacing: 0,
  },
  cardTitle: {
    color: '#F4F7F1',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
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
  summaryBand: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 10,
  },
  scoreBlock: {
    flex: 0.9,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.24)',
    backgroundColor: 'rgba(139,195,74,0.08)',
  },
  actionBlock: {
    flex: 1.1,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  scoreLabel: {
    color: '#8C9988',
    fontSize: 9,
    fontWeight: '900',
  },
  scoreValue: {
    marginTop: 4,
    color: '#F4F7F1',
    fontSize: 15,
    fontWeight: '900',
  },
  scoreSubline: {
    marginTop: 3,
    color: '#B8C4B0',
    fontSize: 11,
    fontWeight: '700',
  },
  actionText: {
    marginTop: 4,
    color: '#F4F7F1',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  routeBlock: {
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    marginBottom: 10,
  },
  sectionLabel: {
    marginTop: 9,
    marginBottom: 5,
    color: '#8BC34A',
    fontSize: 10,
    fontWeight: '900',
  },
  statusText: {
    color: '#F4F7F1',
    fontSize: 12,
    lineHeight: 17,
  },
  statusMuted: {
    marginTop: 3,
    color: '#B8C4B0',
    fontSize: 11,
    lineHeight: 16,
  },
  rowGrid: {
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
  rowDot: {
    width: 8,
    height: 8,
    marginTop: 4,
    borderRadius: 4,
  },
  rowTextGroup: {
    flex: 1,
  },
  rowLabel: {
    color: '#8C9988',
    fontSize: 9,
    fontWeight: '900',
  },
  rowValue: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginBottom: 5,
  },
  reasonDot: {
    width: 8,
    height: 8,
    marginTop: 4,
    borderRadius: 4,
  },
  reasonText: {
    flex: 1,
    color: '#DDE7D6',
    fontSize: 12,
    lineHeight: 17,
  },
  warningText: {
    flex: 1,
    color: '#FFD7A3',
    fontSize: 12,
    lineHeight: 17,
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
