/**
 * DocumentPreviewModal — Full-Screen Document Viewer
 *
 * Opens documents in a full-screen overlay with:
 *   - ECS logo watermark at ~7% opacity (branded document feel)
 *   - Version tagging on all documents
 *   - Export / Share / Download actions
 *   - Dark tactical theme with gold accents
 *   - No playful animations — professional restraint
 *
 * The CommandDock is hidden when this modal is visible.
 */
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';

// ── ECS Watermark Asset ──────────────────────────────────────
const ECS_WATERMARK_URI = 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1773071270019_96f5f11f.png';

// ── ECS Version Constant ─────────────────────────────────────
export const ECS_VERSION = 'v1.4.2';
export const ECS_BUILD = '2026.02.22';
export const ECS_PRODUCT = 'Expedition Command System';
export const ECS_ORG = 'Expedition Command System';


// ── Document Content Registry ────────────────────────────────
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

// ── Props ────────────────────────────────────────────────────
interface DocumentPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  documentCategory: 'system' | 'operational';
  /** Custom content override (for trip-generated documents) */
  customContent?: string;
  onExport?: (content: string) => void;
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

  const content = useMemo(() => {
    if (customContent) return customContent;
    return SYSTEM_DOC_CONTENT[documentId] || `Document content for "${documentTitle}" is not available.`;
  }, [customContent, documentId, documentTitle]);

  const versionFooter = useMemo(() => {
    const now = new Date();
    return [
      `\n${'─'.repeat(52)}`,
      `Generated: ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
      `${ECS_PRODUCT} ${ECS_VERSION} (Build ${ECS_BUILD})`,
      `${ECS_ORG}`,
      '',
      'ACCURACY DISCLAIMER: This document is generated by ECS for planning',
      'purposes only. All data should be independently verified before use',
      'in field operations. See full disclaimer for details.',
    ].join('\n');
  }, []);

  const fullContent = content + versionFooter;

  // Watermark size: ~55% of screen width, maintain 1:1 aspect ratio (logo is roughly square)
  const watermarkSize = Math.round(screenWidth * 0.55);

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport(fullContent);
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([fullContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecs-${documentId}-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [fullContent, documentId, onExport]);

  const handleShare = useCallback(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: `${documentTitle} — ECS`,
        text: fullContent,
      }).catch(() => {});
    } else {
      handleExport();
    }
  }, [fullContent, documentTitle, handleExport]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {/* ── ECS Logo Watermark ───────────────────────────── */}
        <View style={styles.watermarkContainer} pointerEvents="none">
          <Image
            source={{ uri: ECS_WATERMARK_URI }}
            style={[
              styles.watermarkImage,
              { width: watermarkSize, height: watermarkSize },
            ]}
            resizeMode="contain"
          />
        </View>

        {/* ── Header ──────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={TACTICAL.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerCategory}>
              {documentCategory === 'system' ? 'SYSTEM DOCUMENT' : 'OPERATIONAL DOCUMENT'}
            </Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {documentTitle}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={TACTICAL.text} />
          </TouchableOpacity>
        </View>

        {/* ── Version Tag Bar ─────────────────────────────── */}
        <View style={styles.versionBar}>
          <View style={styles.versionDot} />
          <Text style={styles.versionText}>
            {ECS_PRODUCT} {ECS_VERSION}
          </Text>
          <Text style={styles.versionBuild}>Build {ECS_BUILD}</Text>
        </View>

        {/* ── Document Content ────────────────────────────── */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.documentText}>{fullContent}</Text>
          <View style={styles.documentFooterSpace} />
        </ScrollView>

        {/* ── Action Footer ───────────────────────────────── */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.footerBtnSecondary}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={16} color={TACTICAL.amber} />
            <Text style={styles.footerBtnSecondaryText}>SHARE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.footerBtnPrimary}
            onPress={handleExport}
            activeOpacity={0.7}
          >
            <Ionicons name="download-outline" size={16} color="#0B0F12" />
            <Text style={styles.footerBtnPrimaryText}>EXPORT</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0D10',
  },

  // Watermark — absolute-positioned, centered, transparent background
  watermarkContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
    // Slight downward bias for visual balance (header takes top space)
    paddingTop: 40,
  },
  watermarkImage: {
    opacity: 0.07,
    // No background — transparent PNG renders directly on panel bg
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
    backgroundColor: 'rgba(10, 13, 16, 0.95)',
    zIndex: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerCategory: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 3,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },

  // Version Bar
  versionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(196, 138, 44, 0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
    zIndex: 10,
  },
  versionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber,
    opacity: 0.6,
  },
  versionText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  versionBuild: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(138, 138, 133, 0.5)',
    letterSpacing: 0.5,
    fontFamily: 'Courier',
  },

  // Scroll
  scroll: {
    flex: 1,
    zIndex: 5,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  documentText: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(230, 230, 225, 0.85)',
    lineHeight: 20,
    fontFamily: 'Courier',
    letterSpacing: 0.3,
  },
  documentFooterSpace: {
    height: 40,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'web' ? 12 : 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.2)',
    backgroundColor: 'rgba(10, 13, 16, 0.95)',
    zIndex: 10,
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
    borderColor: 'rgba(196, 138, 44, 0.35)',
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
  },
  footerBtnSecondaryText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
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
});



