import React from 'react';
import {
  StyleSheet,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import TacticalPopupShell from '../TacticalPopupShell';
import { TACTICAL } from '../../lib/theme';
import { ECSButton } from '../ECSButton';
import ECSActionRow from '../ECSActionRow';
import { getFullWidgetCatalog, type WidgetSlot } from '../../lib/dashboardStore';
import { CATEGORY_LABELS, getWidgetEntry } from '../../lib/widgetRegistry';
import { renderWidgetDetail, type WidgetRenderOptions } from './WidgetRenderers';
import { getDashboardWidgetReadiness, type DashboardWidgetReadinessStatus } from './widgetReadiness';
import type { LoadItem, RiskScore, Trip, UserSettings, Waypoint } from '../../lib/types';
import { WidgetDetailLeadCard, WidgetDetailStateCard } from './WidgetDetailChrome';
import { DASHBOARD_WIDGET_GRAMMAR } from './widgetGrammar';

interface WidgetDetailModalProps {
  visible: boolean;
  slot: WidgetSlot | null;
  widgetData: {
    activeTrip: Trip | null;
    loadItems: LoadItem[];
    riskScore: RiskScore | null;
    waypoints: Waypoint[];
    userSettings: UserSettings | null;
    syncStatus: string;
    powerAuthority?: {
      isConnected?: boolean;
      isReconnecting?: boolean;
      freshness?: string | null;
      hasPowerData?: boolean;
      deviceLabel?: string | null;
      providerLabel?: string | null;
    } | null;
    telemetry?: {
      hasData?: boolean;
      freshnessLabel?: string | null;
      isWithinGraceWindow?: boolean;
      engineStatus?: string | null;
      lastUpdatedText?: string | null;
    } | null;
    telemetryScanner?: {
      isConnected?: boolean;
      isConnecting?: boolean;
      isReconnecting?: boolean;
      error?: string | null;
    } | null;
    weatherSnapshot?: {
      status?: {
        kind?: string | null;
      } | null;
    } | null;
    gps?: {
      hasFix?: boolean;
    } | null;
  };
  renderOptions?: WidgetRenderOptions;
  onClose: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onOpenPowerConnections?: () => void;
  onOpenTelemetrySetup?: () => void;
  onOpenNavigate?: () => void;
  onOpenFleet?: () => void;
  onRemotenessNavigateToTarget?: (target: 'town' | 'fuel' | 'paved_road') => void;
}

export default function WidgetDetailModal({
  visible,
  slot,
  widgetData,
  renderOptions,
  onClose,
  onReplace,
  onRemove,
  onOpenPowerConnections,
  onOpenTelemetrySetup,
  onOpenNavigate,
  onOpenFleet,
  onRemotenessNavigateToTarget,
}: WidgetDetailModalProps) {
  const widgetType = slot?.widgetType ?? null;
  const catalog = getFullWidgetCatalog();
  const widgetDef = widgetType ? catalog.find(widget => widget.type === widgetType) ?? null : null;
  const registryEntry = widgetType ? getWidgetEntry(widgetType) ?? null : null;
  const readiness = getDashboardWidgetReadiness(widgetType, { widgetData, renderOptions });
  const powerState = widgetData.powerAuthority;
  const powerConnected = Boolean(
    powerState?.isConnected ||
    powerState?.hasPowerData ||
    powerState?.deviceLabel ||
    powerState?.providerLabel,
  );
  const powerNeedsReconnect =
    powerState?.freshness === 'disconnected' ||
    powerState?.freshness === 'last_known' ||
    powerState?.isReconnecting;
  const actionModel =
    widgetType === 'ecs-power'
      ? {
          primaryLabel: powerConnected
            ? (powerNeedsReconnect ? 'Reconnect' : 'Manage Connection')
            : 'Connect',
          primaryIcon: powerConnected
            ? (powerNeedsReconnect ? 'refresh-outline' : 'flash-outline')
            : 'flash-outline',
          primaryTone: 'primary' as const,
          onPrimary: onOpenPowerConnections ?? onReplace,
        }
      : {
          primaryLabel: 'Replace Widget',
          primaryIcon: 'swap-horizontal-outline' as const,
          primaryTone: 'neutral' as const,
          onPrimary: onReplace,
        };
  const readinessActionHandler =
    readiness?.actionKey === 'open_power_connections'
      ? onOpenPowerConnections
      : readiness?.actionKey === 'open_telemetry_setup'
        ? onOpenTelemetrySetup
        : readiness?.actionKey === 'open_navigate'
          ? onOpenNavigate
          : readiness?.actionKey === 'open_fleet'
            ? onOpenFleet
            : undefined;
  const handleReadinessAction = React.useCallback(() => {
    if (!readinessActionHandler) return;
    onClose();
    readinessActionHandler();
  }, [onClose, readinessActionHandler]);
  const readinessAccent = getReadinessAccent(readiness?.status);

  if (!visible || !slot || !widgetType || !widgetDef) return null;

  const isAdvanced = registryEntry?.requires_advanced_mode;
  const category = registryEntry?.category;
  const categoryLabel = category ? CATEGORY_LABELS[category] : 'UNKNOWN';

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      tier="global"
      icon={widgetDef.icon as any}
      eyebrow="WIDGET DETAIL"
      title={widgetDef.name}
      overlayClass="editor"
      maxWidth={940}
      maxHeightFraction={0.9}
      minHeightFraction={0.78}
      footer={
        <ECSActionRow>
          <ECSButton
            label={actionModel.primaryLabel}
            icon={actionModel.primaryIcon as any}
            variant={actionModel.primaryTone === 'primary' ? 'primary' : 'secondary'}
            size="medium"
            onPress={actionModel.onPrimary}
            grow
          />
          <ECSButton
            label="Remove Widget"
            icon="trash-outline"
            variant="destructive"
            size="medium"
            onPress={onRemove}
            grow
          />
        </ECSActionRow>
      }
    >
      <WidgetDetailLeadCard
        eyebrow="DETAIL OVERVIEW"
        title={widgetDef.description}
        tone="neutral"
        badges={[
          { label: categoryLabel },
          ...(isAdvanced ? [{ label: 'ADVANCED', tone: 'manual' as const }] : []),
          ...(registryEntry?.default_size !== '1x1'
            ? [{ label: registryEntry?.default_size.toUpperCase() ?? '1X1' }]
            : []),
          ...(registryEntry?.requires_sensor !== 'none'
            ? [{ label: registryEntry?.requires_sensor?.toUpperCase() ?? 'SENSOR', tone: 'live' as const }]
            : []),
        ]}
      />

      {readiness ? (
        <WidgetDetailStateCard
          title={readiness.title}
          message={readiness.message}
          badgeLabel={readiness.badgeLabel}
          tone={mapReadinessTone(readiness.status)}
          icon={getReadinessIcon(readiness.status)}
          metaLines={readiness.stale ? ['Using cached or aging widget context until fresh inputs return.'] : undefined}
        >
          {readiness.actionLabel && readinessActionHandler ? (
            <ECSButton
              label={readiness.actionLabel}
              icon="arrow-forward-outline"
              variant="secondary"
              size="compact"
              onPress={handleReadinessAction}
              style={styles.readinessActionBtn}
              textStyle={{ color: readinessAccent }}
            />
          ) : null}
        </WidgetDetailStateCard>
      ) : null}

      <View style={styles.detailContent}>
        {renderWidgetDetail(widgetType, widgetData, {
          ...(renderOptions ?? {}),
          onRemotenessNavigateToTarget,
        })}
      </View>
    </TacticalPopupShell>
  );
}

function getReadinessAccent(status: DashboardWidgetReadinessStatus | undefined) {
  switch (status) {
    case 'live':
      return '#4CAF50';
    case 'waiting':
      return '#FFB300';
    case 'fallback':
      return '#4FC3F7';
    case 'disconnected':
      return TACTICAL.amber;
    case 'error':
      return TACTICAL.danger;
    case 'unavailable':
    default:
      return TACTICAL.textMuted;
  }
}

function getReadinessIcon(status: DashboardWidgetReadinessStatus | undefined): React.ComponentProps<typeof Ionicons>['name'] {
  switch (status) {
    case 'live':
      return 'radio-outline';
    case 'waiting':
      return 'time-outline';
    case 'fallback':
      return 'cloud-outline';
    case 'disconnected':
      return 'cloud-offline-outline';
    case 'error':
      return 'alert-circle-outline';
    case 'unavailable':
    default:
      return 'information-circle-outline';
  }
}

function mapReadinessTone(status: DashboardWidgetReadinessStatus | undefined) {
  switch (status) {
    case 'live':
      return 'live' as const;
    case 'waiting':
      return 'attention' as const;
    case 'fallback':
      return 'manual' as const;
    case 'disconnected':
      return 'warning' as const;
    case 'error':
      return 'critical' as const;
    case 'unavailable':
    default:
      return 'muted' as const;
  }
}

const styles = StyleSheet.create({
  detailContent: {
    minHeight: 180,
    paddingTop: DASHBOARD_WIDGET_GRAMMAR.detail.contentGap,
  },
  readinessActionBtn: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
});
