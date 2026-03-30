/**
 * Fleet Sync Modal
 *
 * Full-screen ECS modal that wraps the SyncQueueManager component,
 * providing fleet-level sync management accessible from the Fleet tab header.
 *
 * Integrates:
 *   - LiveSyncBanner (incoming remote change notifications)
 *   - SyncQueueManager (full sync queue management + conflict resolution)
 *
 * The ConflictResolutionModal is already integrated within SyncQueueManager,
 * so it opens automatically when conflicts are detected and the user taps RESOLVE.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import ECSModal from '../ECSModal';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import SyncQueueManager from '../sync/SyncQueueManager';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function FleetSyncModal({ visible, onClose }: Props) {
  if (!visible) return null;

  return (
    <ECSModal visible={visible} onClose={onClose} tier="global">
      <View style={s.overlay}>
        <View style={s.container}>
          {/* ═══════ HEADER ═══════ */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.headerIconWrap}>
                <Ionicons name="sync-outline" size={16} color={TACTICAL.amber} />
              </View>
              <View>
                <Text style={s.headerBrand}>ECS FLEET</Text>
                <Text style={s.headerTitle}>SYNC MANAGEMENT</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={s.closeBtn}
              activeOpacity={0.7}
              accessibilityLabel="Close sync management"
            >
              <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ═══════ SCROLLABLE CONTENT ═══════ */}
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* SyncQueueManager renders:
                - LiveSyncBanner (incoming remote changes)
                - Live Sync toggle card
                - Realtime events
                - Status header with KPI row
                - Conflict alert banner + resolution
                - Pending local changes
                - Offline operation queue
                - Conflict history
                - Sync diagnostics
                - ConflictResolutionModal (opens on RESOLVE tap) */}
            <SyncQueueManager />

            {/* Bottom breathing room */}
            <View style={{ height: 40 }} />
          </ScrollView>

          {/* ═══════ FOOTER ═══════ */}
          <View style={s.footer}>
            <TouchableOpacity
              style={s.doneBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#0B0F12" />
              <Text style={s.doneBtnText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ECSModal>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
    ...(Platform.OS === 'web' ? {
      maxWidth: 700,
      alignSelf: 'center' as any,
      width: '100%',
      marginVertical: 20,
      borderRadius: 16,
      overflow: 'hidden',
      maxHeight: '95vh' as any,
    } : {}),
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingBottom: 12,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    borderBottomColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(11, 15, 18, 0.98)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBrand: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(62, 79, 60, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: GOLD_RAIL.sectionWidth,
    borderTopColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(11, 15, 18, 0.98)',
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },
});



