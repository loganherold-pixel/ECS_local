import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import TacticalPopupShell from '../TacticalPopupShell';

const ECS_WATERMARK_SOURCE = require('../../assets/ecs/nav/ecs-center.png');

export const ECS_VERSION = 'v5.0';
export const ECS_BUILD = '2026.05.23';
export const ECS_PRODUCT = 'Expedition Command System';
export const ECS_ORG = 'Expedition Command System';

export const SYSTEM_DOC_CONTENT: Record<string, string> = {
  privacy: `PRIVACY POLICY
Expedition Command System — ${ECS_ORG}

Last Updated: May 2026

1. DATA COLLECTION
ECS collects and stores expedition planning data created by the operator, including vehicle profiles, OEM or manually entered vehicle specifications, loadout inventories, route geometry, waypoints, trip builder plans, offline prep packs, field notes, dispatch events, convoy membership, and device telemetry when a user connects supported hardware.

2. LOCAL STORAGE
ECS is local-first. Core trip, fleet, loadout, note, and route context can remain on the device so field workflows continue when signal is limited. Signing in does not intentionally clear local setup data.

3. CLOUD SYNC
When signed in, eligible ECS records sync through ECS-owned Supabase services with row-level security. Provider secrets and service-role credentials are kept server-side. Mobile code should call ECS-owned endpoints rather than provider APIs directly.

4. LOCATION DATA
Location is used for navigation, route progress, offline map preparation, weather context, camp scouting, bailout awareness, and convoy tracking. Convoy live sharing is opt-in and should only be visible to active convoy members. A user can stop sharing when the control is available.

5. CONNECTED DEVICES
Bluetooth, BLE, OBD2, and power-device connections are user initiated. ECS may display decoded telemetry such as state of charge, input/output watts, vehicle telemetry, or utility-sensor readings when supported. Unsupported or unauthorized devices should remain visible with a clear status instead of disappearing.

6. THIRD-PARTY SHARING
ECS does not sell user data. External services such as Mapbox, OpenWeather, Supabase, or device-provider APIs may be used only for the specific ECS function requested or enabled by the user.

7. DATA EXPORT & DELETION
Users may export documents through Documentation Center. Deleting an account affects cloud records according to account policy. Local records remain on the device until removed by the user, app settings, or operating-system storage controls.

8. CONTACT
For privacy inquiries, contact the system administrator or visit the Expedition Command System support portal.`,

  disclaimer: `ACCURACY DISCLAIMER
Expedition Command System — ${ECS_ORG}

IMPORTANT: READ BEFORE USE

ECS is a planning, awareness, and field-command tool designed to assist with expedition preparation, navigation context, offline readiness, convoy awareness, vehicle fit, logistics, camp scouting, bailout planning, and incident recovery. It is NOT a substitute for professional navigation, medical, rescue, legal, land-management, or emergency services.

LIMITATIONS:
- ECS readiness, route, camp, bailout, and vehicle-fit assessments are deterministic estimates based on visible input data
- AI-generated language must be treated as explanation, not independent authority
- Fuel, water, power, payload, and range projections depend on manual entries, OEM estimates, or connected telemetry and may not reflect real-world usage
- Route geometry, offline tiles, campground data, dispersed camping eligibility, bailout points, and resupply locations may be incomplete or stale
- Weather data is informational and can change rapidly; verify critical forecasts independently
- Mapbox, GPS, device sensors, OBD2 scanners, and Bluetooth power devices can fail, drift, lose permission, or provide partial telemetry
- Emergency and recovery protocols are reference guides, not professional medical, mechanical, rescue, or legal advice

LIABILITY:
The developers, operators, and distributors of ECS accept no liability for decisions made based on information provided by this system. Users are solely responsible for verifying all critical information independently before and during any expedition.

RECOMMENDATION:
Always carry redundant navigation tools, maintain communication with support contacts, file trip plans with responsible parties, and exercise independent judgment in all field decisions.`,

  instructions: `USE INSTRUCTIONS
Expedition Command System — ${ECS_ORG}

GETTING STARTED:

1. FLEET
   - Create or select the active vehicle
   - Confirm OEM or manually entered fuel, water, payload, clearance, and fit data
   - Add accessories, load zones, and loadout context
   - Review ECS readiness concerns and recommendations

2. EXPLORE
   - Review suggested routes, Trip Builder, and Offline Prep
   - Build trip plans with itinerary, camp, bailout, and resupply context
   - Prepare offline packs after route geometry is available
   - Use Trip Builder map previews to review route stops before committing

3. NAVIGATE
   - Start or preview guidance
   - Use Mapbox route surfaces, dropped pins, camp scouting, remoteness corridor, weather overlays, and offline map context
   - End active guidance only when intentionally selecting the navigation control

4. DASHBOARD
   - Monitor ECS Intelligence, route progress, power, weather, vehicle profile, sunlight, and attitude command widgets
   - Long press the Dashboard button to open Field Utilities
   - Field Utilities contains Weather, Quick Note, Comms, Team Ping, Recovery Protocol, Emergency Protocol, Permits & Access, Trip Summaries, and Documentation

5. DISPATCH
   - Review convoy setup, roster, command surface, live tracking state, team events, and dispatch advisories
   - Convoy live location sharing is opt-in and intended for active members only

6. ECS BRIEF
   - Review departure audit, go/caution/hold decisioning, route intelligence, vehicle fit, camp ops, weather, offline preparedness, fuel/power range, recovery/bailout, and communication confidence

OFFLINE CAPABILITY:
Core planning and field-reference features are designed to remain useful without internet connectivity. Live weather, cloud sync, Mapbox tile downloads, provider data, and connected device telemetry depend on permissions, signal, provider availability, and supported hardware.`,

  'data-handling': `DATA HANDLING POLICY
Expedition Command System — ${ECS_ORG}

1. STORAGE ARCHITECTURE
   - Primary: Local device storage (IndexedDB / AsyncStorage)
   - Secondary: Encrypted cloud storage (Supabase PostgreSQL)
   - Transit: TLS 1.3 encryption for all network requests
   - Edge functions: Provider keys and service-role credentials remain server-side

2. DATA CATEGORIES
   - Vehicle Profiles: Specifications, configurations, zone layouts
   - Loadout Data: Items, weights, zones, packing status
   - Route Data: route geometry, GPX/KML imports, waypoints, pins, offline-prep metadata
   - Expedition Records: Trip plans, risk scores, checklists, itinerary, camp, bailout, resupply context
   - Convoy Records: convoy names, membership, invite status, callsigns, roles, and opt-in location rows
   - Device Telemetry: OBD2, BLE, Bluetooth, and cloud power snapshots when supported and connected
   - Weather Data: current, hourly, daily, alert, and route-corridor weather snapshots
   - User Settings: Preferences, display options, thresholds

3. SYNC BEHAVIOR
   - Offline-first: All operations work without connectivity
   - Automatic sync on reconnection
   - Conflict resolution: Last-write-wins with device tracking
   - Dirty tracking: Only modified records sync
   - Sign-in navigation should not clear saved local fleet, route, or field setup

4. DATA RETENTION
   - Local data persists until user clears app data
   - Cloud data persists until account deletion
   - Convoy location rows should be expired, deleted, or anonymized after expedition completion according to backend retention policy

5. SECURITY
   - Row-level security on all cloud tables
   - User authentication required for cloud access
   - No shared data between user accounts
   - Convoy members should only read active convoy data while membership remains active
   - Invite codes should be stored as hashes, not raw codes
   - Audit logging for authentication and access events`,
};

interface DocumentPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  documentCategory: 'system' | 'operational';
  customContent?: string;
  onExport?: (content: string) => void;
}

function formatGenerationStamp() {
  const now = new Date();
  return `${now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })} • ${now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function DocumentPreviewModal({
  visible,
  onClose,
  documentId,
  documentTitle,
  documentCategory,
  customContent,
  onExport,
}: DocumentPreviewModalProps) {
  const { width: screenWidth } = useWindowDimensions();

  const baseContent = useMemo(() => {
    if (typeof customContent === 'string') {
      return customContent.trim();
    }

    if (documentCategory === 'system') {
      return (SYSTEM_DOC_CONTENT[documentId] ?? '').trim();
    }

    return '';
  }, [customContent, documentCategory, documentId]);

  const hasDocumentBody = baseContent.length > 0;
  const generationStamp = useMemo(() => formatGenerationStamp(), []);

  const versionFooter = useMemo(() => {
    return [
      '',
      '----------------------------------------------------',
      `Generated: ${generationStamp}`,
      `${ECS_PRODUCT} ${ECS_VERSION} (Build ${ECS_BUILD})`,
      ECS_ORG,
      '',
      'ACCURACY DISCLAIMER: This document is generated by ECS for planning',
      'purposes only. All data should be independently verified before use',
      'in field operations. See full disclaimer for details.',
    ].join('\n');
  }, [generationStamp]);

  const fullContent = hasDocumentBody ? `${baseContent}${versionFooter}` : '';
  const watermarkSize = Math.round(screenWidth * 0.55);

  const handleExport = useCallback(() => {
    if (!hasDocumentBody) return;

    if (onExport) {
      onExport(fullContent);
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([fullContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ecs-${documentId}-${new Date().toISOString().split('T')[0]}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  }, [documentId, fullContent, hasDocumentBody, onExport]);

  const handleShare = useCallback(() => {
    if (!hasDocumentBody) return;

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
      navigator
        .share({
          title: `${documentTitle} — ECS`,
          text: fullContent,
        })
        .catch(() => {});
      return;
    }

    handleExport();
  }, [documentTitle, fullContent, handleExport, hasDocumentBody]);

  const footer = (
    <View style={styles.footerActionRow}>
      <TouchableOpacity
        style={[styles.footerBtnSecondary, !hasDocumentBody && styles.footerBtnDisabled]}
        onPress={handleShare}
        activeOpacity={0.7}
        disabled={!hasDocumentBody}
      >
        <Ionicons name="share-outline" size={16} color={hasDocumentBody ? TACTICAL.amber : TACTICAL.textMuted} />
        <Text
          style={[
            styles.footerBtnSecondaryText,
            !hasDocumentBody && styles.footerBtnSecondaryTextDisabled,
          ]}
        >
          SHARE
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerBtnPrimary, !hasDocumentBody && styles.footerBtnDisabledPrimary]}
        onPress={handleExport}
        activeOpacity={0.7}
        disabled={!hasDocumentBody}
      >
        <Ionicons name="download-outline" size={16} color={hasDocumentBody ? '#0B0F12' : 'rgba(11,15,18,0.5)'} />
        <Text style={[styles.footerBtnPrimaryText, !hasDocumentBody && styles.footerBtnPrimaryTextDisabled]}>
          EXPORT
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title={documentTitle || 'Document Preview'}
      icon="document-text-outline"
      eyebrow={documentCategory === 'system' ? 'SYSTEM DOCUMENT' : 'OPERATIONAL DOCUMENT'}
      subtitle="Review the full reference below, then share or export from the dedicated footer actions."
      overlayClass="workflow"
      maxWidth={960}
      maxHeightFraction={0.94}
      minHeightFraction={0.88}
      scrollable={false}
      dismissOnBackdrop={false}
      footer={footer}
      bodyStyle={styles.shellBody}
    >
      <View style={styles.container}>
        <View style={styles.watermarkContainer} pointerEvents="none">
          <Image
            source={ECS_WATERMARK_SOURCE}
            style={[styles.watermarkImage, { width: watermarkSize, height: watermarkSize }]}
            resizeMode="contain"
          />
        </View>

        <View style={styles.metaBar}>
          <View style={styles.metaPill}>
            <View style={styles.versionDot} />
            <Text style={styles.metaText}>
              {documentCategory === 'system' ? 'SYSTEM REFERENCE' : 'FIELD EXPORT'}
            </Text>
          </View>
          <Text style={styles.metaBuild}>Build {ECS_BUILD}</Text>
        </View>

        <View style={styles.versionBar}>
          <Text style={styles.versionText}>
            {ECS_PRODUCT} {ECS_VERSION}
          </Text>
          <Text style={styles.versionBuild}>{generationStamp}</Text>
        </View>

        <View style={styles.contentWrap}>
          {hasDocumentBody ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.documentText}>{fullContent}</Text>
              <View style={styles.documentFooterSpace} />
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={20} color={TACTICAL.textMuted} />
              <Text style={styles.emptyTitle}>Document body unavailable</Text>
              <Text style={styles.emptyCopy}>
                ECS could not load this document body. Close the panel and retry from Documentation Center.
              </Text>
            </View>
          )}
        </View>
      </View>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  shellBody: {
    flex: 1,
    minHeight: 0,
  },
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#0A0D10',
  },
  watermarkContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    zIndex: 0,
  },
  watermarkImage: {
    opacity: 0.065,
  },
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.20)',
  },
  metaText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.6,
  },
  metaBuild: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(138,138,133,0.55)',
    letterSpacing: 0.6,
    fontFamily: 'Courier',
  },
  versionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.18)',
    backgroundColor: 'rgba(196,138,44,0.04)',
    zIndex: 5,
  },
  versionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber,
    opacity: 0.7,
  },
  versionText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  versionBuild: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(138,138,133,0.52)',
    letterSpacing: 0.5,
    fontFamily: 'Courier',
  },
  contentWrap: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    zIndex: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 92,
  },
  documentText: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(230,230,225,0.86)',
    lineHeight: 20,
    fontFamily: 'Courier',
    letterSpacing: 0.25,
  },
  documentFooterSpace: {
    height: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.8,
  },
  emptyCopy: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  footerActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footerBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.35)',
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  footerBtnSecondaryText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  footerBtnSecondaryTextDisabled: {
    color: TACTICAL.textMuted,
  },
  footerBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  footerBtnPrimaryText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 2,
  },
  footerBtnDisabled: {
    borderColor: 'rgba(62,79,60,0.2)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  footerBtnDisabledPrimary: {
    backgroundColor: 'rgba(138,138,133,0.35)',
  },
  footerBtnPrimaryTextDisabled: {
    opacity: 0.5,
  },
});
