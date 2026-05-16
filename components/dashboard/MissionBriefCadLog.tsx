import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { useTheme } from '../../context/ThemeContext';
import { ECS, TACTICAL } from '../../lib/theme';
import {
  briefCadLogStore,
  BRIEF_CAD_LOG_LIMIT,
  type BriefCadLogEntry,
} from '../../lib/briefCadLogStore';

function formatTimestamp(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

function formatCoordinate(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '--' : value.toFixed(5);
}

function formatSourceLabel(source: BriefCadLogEntry['source']): string | null {
  if (!source) return null;
  if (source === 'ecs-shared-weather') return 'ECS WEATHER';
  if (source === 'ecs-remote-weather') return 'ECS REMOTE WEATHER';
  if (source === 'dashboard_advisory') return 'DASHBOARD';
  return String(source).replace(/[_-]+/g, ' ').toUpperCase();
}

function formatSeverityLabel(severity: BriefCadLogEntry['severity']): string | null {
  return severity ? String(severity).toUpperCase() : null;
}

function isRemoteWeatherEntry(entry: BriefCadLogEntry): boolean {
  return entry.source === 'ecs-remote-weather' || entry.source === 'ecs-shared-weather';
}

function getRemoteWeatherSeverityAccent(severity: BriefCadLogEntry['severity']): string {
  switch (severity) {
    case 'critical':
      return TACTICAL.danger;
    case 'warning':
      return ECS.warning;
    case 'watch':
      return TACTICAL.amber;
    case 'info':
    default:
      return TACTICAL.textMuted;
  }
}

type Props = {
  fullHeight?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function MissionBriefCadLog({ fullHeight = false, style }: Props) {
  const { palette, colors, isLight } = useTheme();
  const [entries, setEntries] = useState<BriefCadLogEntry[]>(() => briefCadLogStore.getEntries());

  useEffect(() => {
    return briefCadLogStore.subscribe(() => {
      setEntries(briefCadLogStore.getEntries());
    });
  }, []);

  const displayEntries = useMemo(() => entries.slice().reverse(), [entries]);

  return (
    <View
      style={[
        styles.container,
        fullHeight && styles.fullHeightContainer,
        {
          backgroundColor: isLight ? palette.panel : 'rgba(7,11,18,0.96)',
          borderColor: isLight ? palette.border : 'rgba(196,138,44,0.18)',
          shadowColor: isLight ? '#00000012' : '#000',
        },
        style,
      ]}
    >
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Ionicons name="document-text-outline" size={15} color={TACTICAL.amber} />
            <Text style={[styles.title, { color: palette.amber }]}>BRIEF ACTIVITY LOG</Text>
          </View>
        <Text style={[styles.countLabel, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.62)' }]}>
          {entries.length}/{BRIEF_CAD_LOG_LIMIT}
        </Text>
      </View>

      {displayEntries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>Awaiting brief activity</Text>
          <Text style={[styles.emptyText, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.68)' }]}>
            Completed brief alerts and guidance will collect here with timestamps so they remain easy to reference.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.logScroll}
          contentContainerStyle={styles.logContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {displayEntries.map((entry) => {
            const isRemoteWeather = isRemoteWeatherEntry(entry);
            const sourceLabel = formatSourceLabel(entry.source);
            const severityLabel = formatSeverityLabel(entry.severity);
            const titleLine = [severityLabel, entry.title].filter(Boolean).join('  ');
            const remoteAccent = getRemoteWeatherSeverityAccent(entry.severity);
            return (
              <View
                key={entry.eventKey}
                style={[
                  styles.logRow,
                  {
                    borderColor: isRemoteWeather
                      ? remoteAccent
                      : isLight ? palette.border : 'rgba(255,255,255,0.06)',
                    backgroundColor: isRemoteWeather
                      ? isLight ? colors.bgInput : 'rgba(255,255,255,0.035)'
                      : isLight ? colors.bgInput : 'rgba(255,255,255,0.03)',
                  },
                  isRemoteWeather && styles.remoteWeatherRow,
                ]}
              >
                {isRemoteWeather ? (
                  <>
                    <View style={styles.remoteWeatherHeaderRow}>
                      <Text style={[styles.remoteWeatherMetaText, { color: remoteAccent }]}>
                        {formatTimestamp(entry.timestamp)}
                      </Text>
                      <Text style={[styles.remoteWeatherPipeText, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.5)' }]}>|</Text>
                      <Text style={[styles.remoteWeatherSeverityText, { color: remoteAccent }]}>
                        {severityLabel ?? 'INFO'}
                      </Text>
                      <Text style={[styles.remoteWeatherPipeText, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.5)' }]}>|</Text>
                      <Text style={[styles.remoteWeatherTitleText, { color: palette.text }]} numberOfLines={1}>
                        {entry.title ?? sourceLabel ?? 'REMOTE WEATHER ADVISORY'}
                      </Text>
                    </View>
                    <Text style={[styles.messageText, styles.remoteWeatherMessageText, { color: palette.text }]}>
                      {entry.message}
                    </Text>
                    {entry.recommendedAction ? (
                      <Text style={[styles.actionText, styles.remoteWeatherActionText, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.78)' }]}>
                        <Text style={{ color: remoteAccent }}>Action: </Text>
                        {entry.recommendedAction}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <>
                    <View style={styles.metaRow}>
                      <Text style={[styles.metaText, { color: palette.amber }]}>
                        {formatTimestamp(entry.timestamp)}
                      </Text>
                      <Text style={[styles.metaText, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.62)' }]}>
                        LAT {formatCoordinate(entry.latitude)}  LON {formatCoordinate(entry.longitude)}
                      </Text>
                    </View>
                    {sourceLabel ? (
                      <Text style={[styles.sourceText, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.62)' }]} numberOfLines={1}>
                        {sourceLabel}
                      </Text>
                    ) : null}
                    {titleLine ? (
                      <Text style={[styles.eventTitleText, { color: palette.amber }]} numberOfLines={1}>
                        {titleLine}
                      </Text>
                    ) : null}
                    <Text style={[styles.messageText, { color: palette.text }]}>
                      {entry.message}
                    </Text>
                    {entry.recommendedAction ? (
                      <Text style={[styles.actionText, { color: isLight ? colors.textSecondary : 'rgba(233,237,244,0.72)' }]}>
                        {entry.recommendedAction}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    minHeight: 176,
    maxHeight: 320,
  },
  fullHeightContainer: {
    flex: 1,
    minHeight: 0,
    maxHeight: undefined,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  countLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 420,
  },
  logScroll: {
    marginTop: 12,
    flex: 1,
  },
  logContent: {
    gap: 8,
    paddingBottom: 2,
  },
  logRow: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  remoteWeatherRow: {
    borderLeftWidth: 3,
    paddingLeft: 11,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  metaText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  sourceText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  eventTitleText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  actionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  remoteWeatherHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  remoteWeatherMetaText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  remoteWeatherPipeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  remoteWeatherSeverityText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  remoteWeatherTitleText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  remoteWeatherMessageText: {
    fontWeight: '700',
  },
  remoteWeatherActionText: {
    fontWeight: '800',
  },
});
