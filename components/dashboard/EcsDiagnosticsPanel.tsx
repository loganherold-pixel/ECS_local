/**
 * ECS Diagnostics Panel — Hidden Developer Mode
 * ================================================
 *
 * Full-screen modal panel accessible only through a developer gesture
 * (triple tap on expedition title in dashboard header).
 *
 * Displays real-time system status for all major ECS subsystems:
 *   - System Status (Connectivity, Remoteness, Risk Engine)
 *   - Telemetry (Vehicle OBD2, BLU Power)
 *   - Offline Expedition Database
 *   - Assistant Context
 *   - Map + Navigation
 *   - Performance
 *   - Core Engines
 *
 * Features:
 *   - Auto-refresh every 5 seconds when visible
 *   - Expandable metadata rows for each subsystem
 *   - ECS dark-mode styling throughout
 *   - Not accessible in Android Auto or Apple CarPlay
 *   - Console logging when diagnostics mode is opened
 *   - Dismissible via close button or swipe
 *
 * RESTRICTED: Only visible when __DEV__ is true.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Platform,
  Pressable,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import {
  runDiagnostics,
  type DiagnosticsReport,
  type SystemDiagnostic,
  type DiagnosticStatus,
  DIAGNOSTIC_SECTIONS,
} from '../../lib/ecsDiagnostics';

// ── Developer Mode Gate ──────────────────────────────────────
const ECS_DEV_MODE = __DEV__ || false;

// ── Status Colors ────────────────────────────────────────────
const STATUS_COLORS: Record<DiagnosticStatus, string> = {
  OK: '#66BB6A',
  FAILED: '#EF5350',
  DEGRADED: '#FFB74D',
  IDLE: '#8A8A85',
};

const STATUS_ICONS: Record<DiagnosticStatus, string> = {
  OK: 'checkmark-circle',
  FAILED: 'close-circle',
  DEGRADED: 'alert-circle',
  IDLE: 'ellipse-outline',
};

// ── Props ────────────────────────────────────────────────────
interface EcsDiagnosticsPanelProps {
  visible: boolean;
  onClose: () => void;
}

// ── Meta Value Row ───────────────────────────────────────────
function MetaRow({ label, value }: { label: string; value: string | number | boolean | null }) {
  const displayValue = value === null || value === undefined
    ? 'unknown'
    : typeof value === 'boolean'
      ? value ? 'true' : 'false'
      : String(value);

  const valueColor = value === null || value === undefined
    ? '#6B5B3E'
    : value === true || value === 'OK' || value === 'available' || value === 'connected' || value === 'live'
      ? '#66BB6A'
    : value === false || value === 'FAILED' || value === 'unavailable' || value === 'disconnected' || value === 'error'
      ? '#EF5350'
    : value === 'stale' || value === 'DEGRADED' || value === 'degraded' || value === 'recovering'
      ? '#FFB74D'
    : '#A0A09A';

  return (
    <View style={metaStyles.row}>
      <Text style={metaStyles.label}>{label}</Text>
      <Text style={[metaStyles.value, { color: valueColor }]}>{displayValue}</Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.5,
    color: '#6B6B66',
    flex: 1,
  },
  value: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'right',
    flex: 1,
  },
});

// ── System Row Component ─────────────────────────────────────
function SystemRow({ system }: { system: SystemDiagnostic }) {
  const [expanded, setExpanded] = useState(false);
  const color = STATUS_COLORS[system.status];
  const icon = STATUS_ICONS[system.status];
  const hasMeta = system.meta && Object.keys(system.meta).length > 0;

  return (
    <View style={rowStyles.wrapper}>
      <TouchableOpacity
        style={rowStyles.container}
        onPress={() => hasMeta && setExpanded(!expanded)}
        activeOpacity={hasMeta ? 0.7 : 1}
      >
        <View style={rowStyles.statusCol}>
          <Ionicons name={icon as any} size={13} color={color} />
        </View>
        <View style={rowStyles.infoCol}>
          <Text style={rowStyles.name}>{system.name}</Text>
          <Text style={[rowStyles.description, { color }]} numberOfLines={2}>
            {system.description}
          </Text>
        </View>
        <View style={rowStyles.rightCol}>
          <View style={[rowStyles.statusBadge, { borderColor: color + '40', backgroundColor: color + '10' }]}>
            <Text style={[rowStyles.statusText, { color }]}>{system.status}</Text>
          </View>
          {hasMeta && (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={10}
              color={TACTICAL.textMuted}
              style={{ marginTop: 3 }}
            />
          )}
        </View>
      </TouchableOpacity>

      {expanded && system.meta && (
        <View style={rowStyles.metaContainer}>
          {Object.entries(system.meta).map(([key, val]) => (
            <MetaRow key={key} label={key} value={val} />
          ))}
          {system.lastUpdated && (
            <MetaRow label="last_updated" value={system.lastUpdated} />
          )}
        </View>
      )}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(212,160,23,0.08)',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    gap: 8,
  },
  statusCol: {
    width: 18,
    alignItems: 'center',
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  name: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: ECS.text,
  },
  description: {
    fontSize: 8.5,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  statusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
    borderWidth: 0.5,
  },
  statusText: {
    fontSize: 6.5,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  metaContainer: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingVertical: 4,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(212,160,23,0.06)',
  },
});


// ── Section Header ───────────────────────────────────────────
function SectionHeader({ label, icon, systemCount, okCount }: {
  label: string;
  icon: string;
  systemCount: number;
  okCount: number;
}) {
  return (
    <View style={sectionStyles.header}>
      <Ionicons name={icon as any} size={11} color={ECS.accent} />
      <Text style={sectionStyles.label}>{label}</Text>
      <Text style={sectionStyles.count}>{okCount}/{systemCount}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: GOLD_RAIL.subsection,
  },
  label: {
    flex: 1,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    color: ECS.accent,
    textTransform: 'uppercase',
  },
  count: {
    fontSize: 8,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: TACTICAL.textMuted,
  },
});


// ── Main Panel ───────────────────────────────────────────────

export default function EcsDiagnosticsPanel({ visible, onClose }: EcsDiagnosticsPanelProps) {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Run diagnostics on mount and when refresh is triggered
  useEffect(() => {
    if (!visible) return;
    try {
      const r = runDiagnostics();
      setReport(r);
    } catch (e) {
      console.warn('[ECS_DIAGNOSTICS_PANEL] Failed to run diagnostics:', e);
    }
  }, [visible, refreshCount]);

  // Log when opened
  useEffect(() => {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && visible) {
      console.log('[ECS_DIAGNOSTICS] Developer diagnostics panel opened');
    }
  }, [visible]);

  // Auto-refresh every 5 seconds when visible
  useEffect(() => {
    if (!visible) {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
      return;
    }
    autoRefreshRef.current = setInterval(() => {
      setRefreshCount(c => c + 1);
    }, 5000);
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [visible]);

  const handleRefresh = useCallback(() => {
    setRefreshCount(c => c + 1);
  }, []);

  // Group systems by section
  const groupedSystems = useMemo(() => {
    if (!report) return {};
    const groups: Record<string, SystemDiagnostic[]> = {};
    for (const sys of report.systems) {
      const section = sys.section || 'other';
      if (!groups[section]) groups[section] = [];
      groups[section].push(sys);
    }
    return groups;
  }, [report]);

  if (!ECS_DEV_MODE) return null;
  if (!visible) return null;

  const overallColor = report ? STATUS_COLORS[report.overallStatus] : '#8A8A85';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="hardware-chip-outline" size={16} color={ECS.accent} />
            <View>
              <Text style={styles.headerTitle}>ECS DIAGNOSTICS</Text>
              <Text style={styles.headerSubtitle}>
                {report?.appVersion || '1.0.0'} — {report?.buildEnv || 'dev'}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={handleRefresh}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.headerBtn}
            >
              <Ionicons name="refresh-outline" size={16} color={TACTICAL.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.headerBtn}
            >
              <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Overall Status Banner */}
        {report && (
          <View style={[styles.overallBanner, { borderColor: overallColor + '30' }]}>
            <Ionicons name={STATUS_ICONS[report.overallStatus] as any} size={16} color={overallColor} />
            <Text style={[styles.overallText, { color: overallColor }]}>
              {report.overallStatus === 'OK' ? 'ALL SYSTEMS NOMINAL' :
               report.overallStatus === 'FAILED' ? `${report.failedCount} SYSTEM${report.failedCount > 1 ? 'S' : ''} FAILED` :
               report.overallStatus === 'DEGRADED' ? `${report.degradedCount} DEGRADED` :
               'ALL SYSTEMS IDLE'}
            </Text>
            <Text style={styles.overallCount}>
              {report.okCount}/{report.systems.length}
            </Text>
          </View>
        )}

        {/* Scrollable System List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {DIAGNOSTIC_SECTIONS.map(section => {
            const systems = groupedSystems[section.key];
            if (!systems || systems.length === 0) return null;
            const okCount = systems.filter(s => s.status === 'OK').length;

            return (
              <View key={section.key}>
                <SectionHeader
                  label={section.label}
                  icon={section.icon}
                  systemCount={systems.length}
                  okCount={okCount}
                />
                {systems.map(sys => (
                  <SystemRow key={sys.key} system={sys} />
                ))}
              </View>
            );
          })}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {report ? `Generated ${new Date(report.generatedAt).toLocaleTimeString()}` : 'Loading...'}
            </Text>
            <Text style={styles.footerLabel}>DEV DIAGNOSTICS — AUTO-REFRESH 5s</Text>
            <Text style={styles.footerWarning}>
              Not available on Android Auto or Apple CarPlay
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}


// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 56,
    paddingBottom: 12,
    backgroundColor: ECS.bgPanel,
    borderBottomWidth: 1.5,
    borderBottomColor: GOLD_RAIL.major,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    color: ECS.accent,
    textTransform: 'uppercase',
  },
  headerSubtitle: {
    fontSize: 8,
    fontWeight: '500',
    letterSpacing: 1,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBtn: {
    padding: 4,
  },
  overallBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(212,160,23,0.1)',
  },
  overallText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  overallCount: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    marginTop: 12,
  },
  footerText: {
    fontSize: 8,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    opacity: 0.7,
  },
  footerLabel: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 3,
    color: TACTICAL.textMuted,
    opacity: 0.4,
  },
  footerWarning: {
    fontSize: 7,
    fontWeight: '500',
    letterSpacing: 1,
    color: '#6B5B3E',
    marginTop: 4,
  },
});



