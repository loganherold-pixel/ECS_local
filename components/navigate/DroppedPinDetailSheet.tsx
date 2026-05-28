import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import type { ECSPin } from './PinTypes';
import { getPinTypeMeta } from './PinTypes';

type Props = {
  visible: boolean;
  pin: ECSPin | null;
  topOffset: number;
  bottomOffset: number;
  nearestRoadLabel?: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
};

const WEB_SCROLL_CONTAINMENT_STYLE =
  Platform.OS === 'web'
    ? ({
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
      } as any)
    : null;

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : 'Unknown';
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || 'Unknown'}</Text>
    </View>
  );
}

export default function DroppedPinDetailSheet({
  visible,
  pin,
  topOffset,
  bottomOffset,
  nearestRoadLabel = null,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  if (!visible || !pin) return null;

  const meta = getPinTypeMeta(pin.type);
  const roadLabel = nearestRoadLabel?.trim() || 'Not resolved for this dropped pin.';
  const notes = pin.notes?.trim() || 'No notes saved.';
  const scrollContentStyle = WEB_SCROLL_CONTAINMENT_STYLE
    ? [styles.bodyContent, WEB_SCROLL_CONTAINMENT_STYLE]
    : styles.bodyContent;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View
        pointerEvents="auto"
        style={[
          styles.shell,
          {
            top: topOffset,
            bottom: bottomOffset + 10,
          },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={[styles.pinIcon, { borderColor: `${meta.color}66`, backgroundColor: meta.bgColor }]}>
              <Ionicons name={meta.icon as any} size={17} color={meta.color} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Dropped Pin</Text>
              <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                {pin.title || meta.defaultTitle}
              </Text>
              <Text style={styles.subtitle}>{meta.label}</Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onClose}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Close dropped pin details"
            >
              <Ionicons name="close" size={17} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={scrollContentStyle}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.coordGrid}>
              <View style={styles.coordTile}>
                <Text style={styles.coordLabel}>LATITUDE</Text>
                <Text style={styles.coordValue}>{formatCoordinate(pin.lat)}</Text>
              </View>
              <View style={styles.coordTile}>
                <Text style={styles.coordLabel}>LONGITUDE</Text>
                <Text style={styles.coordValue}>{formatCoordinate(pin.lng)}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <DetailRow label="Nearest road" value={roadLabel} />
              <DetailRow label="Created" value={new Date(pin.created_at).toLocaleString()} />
              <DetailRow label="Status" value={pin.resolved ? 'Resolved' : 'Active'} />
            </View>

            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Notes</Text>
              <Text style={styles.notesText}>{notes}</Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onEdit} activeOpacity={0.78}>
              <Ionicons name="pencil-outline" size={13} color={TACTICAL.text} />
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerButton} onPress={onDelete} activeOpacity={0.78}>
              <Ionicons name="trash-outline" size={13} color="#F07D71" />
              <Text style={styles.dangerButtonText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={onClose} activeOpacity={0.84}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 78,
    elevation: 78,
  },
  shell: {
    position: 'absolute',
    left: 12,
    right: 12,
    justifyContent: 'flex-end',
  },
  card: {
    maxWidth: 430,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.32)',
    backgroundColor: 'rgba(8,14,18,0.96)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(242,194,77,0.16)',
  },
  pinIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  title: {
    ...TYPO.T2,
    color: TACTICAL.text,
    fontSize: 15,
  },
  subtitle: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.18)',
    backgroundColor: 'rgba(12,16,20,0.82)',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  coordGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  coordTile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.18)',
    backgroundColor: 'rgba(18,24,29,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  coordLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 1.1,
  },
  coordValue: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 13,
  },
  section: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 7,
  },
  detailLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
    flex: 0.42,
    fontSize: 10,
    letterSpacing: 1.1,
  },
  detailValue: {
    ...TYPO.B2,
    color: TACTICAL.text,
    flex: 0.58,
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 16,
  },
  notesBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.16)',
    backgroundColor: 'rgba(242,194,77,0.07)',
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 6,
  },
  notesLabel: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  notesText: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(242,194,77,0.14)',
  },
  secondaryButton: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...TYPO.U2,
    color: TACTICAL.text,
    fontSize: 9,
    letterSpacing: 1,
  },
  dangerButton: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,125,113,0.26)',
    backgroundColor: 'rgba(240,125,113,0.08)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  dangerButtonText: {
    ...TYPO.U2,
    color: '#F07D71',
    fontSize: 9,
    letterSpacing: 1,
  },
  primaryButton: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...TYPO.U2,
    color: '#091014',
    fontSize: 9,
    letterSpacing: 1,
  },
});
