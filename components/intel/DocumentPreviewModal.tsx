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

export const ECS_VERSION = 'v1.4.2';
export const ECS_BUILD = '2026.02.22';
export const ECS_PRODUCT = 'Expedition Command System';
export const ECS_ORG = 'Expedition Command System';

export const SYSTEM_DOC_CONTENT: Record<string, string> = {
  privacy: `PRIVACY POLICY
Expedition Command System — ${ECS_ORG}

Last Updated: February 2026

1. DATA COLLECTION
ECS collects and stores expedition planning data including vehicle configurations, loadout inventories, route data, waypoints, risk assessments, and consumable projections. All data is created by the user and stored locally on the device by default.

2. LOCAL STORAGE
All expedition data is stored locally using device storage (IndexedDB on web, AsyncStorage on mobile). No data leaves your device unless you explicitly enable cloud sync by signing in.

3. CLOUD SYNC
When signed in, data syncs to encrypted cloud storage via Supabase with row-level security. Data is encrypted in transit using TLS 1.3. Each user can only access their own data.

4. LOCATION DATA
Location data is only collected when the user explicitly enables GPS tracking for route recording. Location data is never shared with third parties and is stored only within the user's expedition records.

5. THIRD-PARTY SHARING
ECS does not share, sell, or distribute user data to any third parties. No advertising networks, analytics services, or data brokers receive any user information.

6. DATA EXPORT & DELETION
Users may export all data at any time via the Intel > Documentation Center. Deleting your account removes all cloud-stored data permanently. Local data remains on the device until manually cleared.

7. CONTACT
For privacy inquiries, contact the system administrator or visit the Expedition Command System support portal.`,

  disclaimer: `ACCURACY DISCLAIMER
Expedition Command System — ${ECS_ORG}

IMPORTANT: READ BEFORE USE

ECS is a planning and awareness tool designed to assist with expedition preparation, loadout management, and route planning. It is NOT a substitute for professional navigation, medical, emergency, or survival services.

LIMITATIONS:
- All risk assessments are algorithmic estimates based on user-provided inputs
- Fuel projections depend on user-entered vehicle specifications and may not reflect real-world conditions
- Water and consumable calculations are estimates and should include safety margins
- Route distances and elevation data are derived from imported GPS data and may contain inaccuracies
- Weather data, when available, is informational only and should be verified independently
- Emergency protocols are reference guides, not professional medical or rescue advice

LIABILITY:
The developers, operators, and distributors of ECS accept no liability for decisions made based on information provided by this system. Users are solely responsible for verifying all critical information independently before and during any expedition.

RECOMMENDATION:
Always carry redundant navigation tools, maintain communication with support contacts, file trip plans with responsible parties, and exercise independent judgment in all field decisions.`,

  instructions: `USE INSTRUCTIONS
Expedition Command System — ${ECS_ORG}

GETTING STARTED:

1. EXPEDITION TAB (Build Mode)
   - Configure your vehicle profile with specifications
   - Set up framework and zone containers
   - Build loadout with categorized gear items
   - Assign items to vehicle zones
   - Set expedition to ready state

2. DASHBOARD TAB (Live Mode)
   - Monitor real-time consumable projections
   - View customizable widget grid
   - Track trip duration and distance
   - Monitor vehicle systems data

3. NAVIGATE TAB (Input Mode)
   - Import GPX/KML route files
   - Create and edit waypoints
   - View elevation profiles
   - Calculate terrain distances
   - Export route data

4. SAFETY TAB (Response Mode)
   - Access emergency protocols offline
   - Review medical quick-reference guides
   - Score route risk factors
   - Check build readiness vs terrain

5. INTEL TAB (Awareness Mode)
   - Review environmental intelligence
   - Manage operational access data
   - Generate trip summaries
   - Export official documents

OFFLINE CAPABILITY:
All core features work without internet connectivity. Data syncs automatically when connection is restored.`,

  'data-handling': `DATA HANDLING POLICY
Expedition Command System — ${ECS_ORG}

1. STORAGE ARCHITECTURE
   - Primary: Local device storage (IndexedDB / AsyncStorage)
   - Secondary: Encrypted cloud storage (Supabase PostgreSQL)
   - Transit: TLS 1.3 encryption for all network requests

2. DATA CATEGORIES
   - Vehicle Profiles: Specifications, configurations, zone layouts
   - Loadout Data: Items, weights, zones, packing status
   - Route Data: GPX/KML imports, waypoints, segments
   - Expedition Records: Trip plans, risk scores, checklists
   - User Settings: Preferences, display options, thresholds

3. SYNC BEHAVIOR
   - Offline-first: All operations work without connectivity
   - Automatic sync on reconnection
   - Conflict resolution: Last-write-wins with device tracking
   - Dirty tracking: Only modified records sync

4. DATA RETENTION
   - Local data persists until user clears app data
   - Cloud data persists until account deletion
   - No automatic data expiration or purging

5. SECURITY
   - Row-level security on all cloud tables
   - User authentication required for cloud access
   - No shared data between user accounts
   - Audit logging for authentication events`,
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
