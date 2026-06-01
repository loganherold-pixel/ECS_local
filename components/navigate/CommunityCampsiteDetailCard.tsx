import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import type {
  CampSitePhotoResponse,
  PublicCampSite,
} from '../../lib/campsites/campsiteRecommendationService';
import { formatCommunityCampsiteValue } from '../../lib/campsites/communityCampsiteMapLayer';
import { getCampSiteTrustLabel } from '../../lib/campsites/campsiteTrustScoring';
import { TACTICAL, TYPO } from '../../lib/theme';

type Props = {
  visible: boolean;
  site: PublicCampSite | null;
  topOffset: number;
  bottomOffset: number;
  rightInset: number;
  maxWidth?: number;
  photos?: CampSitePhotoResponse[];
  onNavigateHere?: () => void;
  onSave: () => void;
  onConfirm: () => void;
  onFlag: () => void;
  onDismiss: () => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function formatBoolean(value: boolean | null | undefined): string {
  if (value == null) return 'Unknown';
  return value ? 'Yes' : 'No';
}

function joinList(values: unknown): string {
  if (!Array.isArray(values) || values.length === 0) return 'Unknown';
  return values.map((value) => formatCommunityCampsiteValue(String(value))).join(', ');
}

function amenitiesList(site: PublicCampSite): string {
  const entries = Object.entries(site.amenities ?? {})
    .filter(([, value]) => value === true)
    .map(([key]) => formatCommunityCampsiteValue(key));
  return entries.length > 0 ? entries.join(', ') : 'None listed';
}

function conditionValue(site: PublicCampSite, key: string): string | null {
  const value = site.conditions?.[key];
  if (typeof value === 'string') return formatCommunityCampsiteValue(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return formatBoolean(value);
  return null;
}

function isEstablishedCampsite(site: PublicCampSite): boolean {
  return site.site_type === 'established_dispersed' || site.site_type === 'developed' || site.site_type === 'paid';
}

export default function CommunityCampsiteDetailCard({
  visible,
  site,
  topOffset,
  bottomOffset,
  rightInset,
  maxWidth,
  photos = [],
  onNavigateHere,
  onSave,
  onConfirm,
  onFlag,
  onDismiss,
}: Props) {
  if (!visible || !site) return null;

  const notes =
    typeof site.conditions?.seasonal_notes === 'string'
      ? site.conditions.seasonal_notes
      : null;
  const cellSignal = conditionValue(site, 'cell_signal');
  const underReview = site.status === 'hidden_pending_review';
  const sourceLabel = isEstablishedCampsite(site) ? 'ESTABLISHED CAMPSITE' : 'APPROVED COMMUNITY CAMPSITE';
  const sourceValue = isEstablishedCampsite(site) ? 'Established Campground' : 'Approved Community Campsite';

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: topOffset + 12,
          bottom: bottomOffset + 12,
          left: 12,
          right: rightInset + 12,
          maxWidth: maxWidth ?? undefined,
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="trail-sign-outline" size={17} color={TACTICAL.amber} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>{sourceLabel}</Text>
            <Text style={styles.title}>{site.canonical_name ?? 'Community Campsite'}</Text>
            {underReview ? <Text style={styles.reviewBadge}>UNDER REVIEW</Text> : null}
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onDismiss} activeOpacity={0.84}>
            <Ionicons name="close" size={16} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            <Info label="Site Type" value={formatCommunityCampsiteValue(site.site_type)} />
            <Info label="Access" value={formatCommunityCampsiteValue(site.access_difficulty)} />
            <Info label="Vehicle Fit" value={joinList(site.vehicle_fit)} wide />
            <Info label="Trailer Friendly" value={formatBoolean(site.trailer_friendly)} />
            <Info
              label="Max Rig"
              value={site.max_rig_length_ft ? `${site.max_rig_length_ft} ft` : 'Unknown'}
            />
            <Info label="Cell Signal" value={cellSignal ?? 'Unknown'} />
            <Info label="Amenities" value={amenitiesList(site)} wide />
            <Info label="Source" value={sourceValue} wide />
            <Info label="Last Confirmed" value={formatDate(site.last_confirmed_at)} />
            <Info label="Confirmations" value={String(site.confirmation_count)} />
            <Info label="Flags" value={String(site.flag_count)} />
            <Info
              label="Trust"
              value={`${getCampSiteTrustLabel(site.trust_score)} (${Math.round(site.trust_score)}/100)`}
            />
            <Info label="Legal Confidence" value={formatCommunityCampsiteValue(site.legal_confidence)} />
          </View>

          {underReview ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>
                This campsite is under moderator review and hidden from the public community layer.
              </Text>
            </View>
          ) : site.flag_count >= 3 ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>
                This campsite has multiple unresolved flags. ECS keeps it visible pending admin review.
              </Text>
            </View>
          ) : null}

          {notes ? (
            <View style={styles.notesCard}>
              <Text style={styles.infoLabel}>Notes</Text>
              <Text style={styles.notesText}>{notes}</Text>
            </View>
          ) : null}

          {photos.length > 0 ? (
            <View style={styles.photosCard}>
              <Text style={styles.infoLabel}>Approved Photos</Text>
              <View style={styles.photoRow}>
                {photos.map((photo) => {
                  const uri = photo.thumbnail_url ?? photo.storage_url;
                  return (
                    <Image
                      key={photo.id}
                      source={{ uri }}
                      style={styles.photoThumb}
                      resizeMode="cover"
                    />
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Action icon="navigate-outline" label="Navigate" onPress={onNavigateHere} />
          <Action icon="bookmark-outline" label="Save" onPress={onSave} />
          <Action icon="checkmark-circle-outline" label="Confirm still available" onPress={onConfirm} />
          <Action icon="flag-outline" label="Flag problem" onPress={onFlag} danger />
        </View>
      </View>
    </View>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.infoTile, wide && styles.infoTileWide]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, danger && styles.actionButtonDanger, !onPress && styles.actionButtonDisabled]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.86}
    >
      <Ionicons
        name={icon as any}
        size={14}
        color={!onPress ? TACTICAL.textMuted : danger ? '#FF9A8A' : TACTICAL.amber}
      />
      <Text style={[styles.actionText, danger && styles.actionTextDanger, !onPress && styles.actionTextDisabled]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 140,
    elevation: 140,
    pointerEvents: 'box-none',
  },
  card: {
    flex: 1,
    minHeight: 0,
    maxHeight: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(94,161,255,0.28)',
    backgroundColor: 'rgba(8,12,15,0.985)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.34,
    shadowRadius: 16,
    elevation: 18,
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(94,161,255,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    ...TYPO.U2,
    color: '#5EA1FF',
    fontSize: 8,
    letterSpacing: 1.1,
  },
  title: {
    ...TYPO.T2,
    color: TACTICAL.text,
    fontSize: 14,
    lineHeight: 18,
  },
  reviewBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.42)',
    color: '#FFD18A',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyContent: {
    padding: 12,
    gap: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoTile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  infoTileWide: {
    flexBasis: '100%',
  },
  infoLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7.5,
    letterSpacing: 0.85,
  },
  infoValue: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 10.5,
    lineHeight: 15,
  },
  notesCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(196,138,44,0.06)',
    padding: 10,
    gap: 4,
  },
  photosCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(196,138,44,0.06)',
    padding: 10,
    gap: 8,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoThumb: {
    width: 78,
    height: 58,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  warningCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,154,138,0.26)',
    backgroundColor: 'rgba(255,154,138,0.08)',
    padding: 10,
  },
  warningText: {
    ...TYPO.B2,
    color: '#FFB4A8',
    fontSize: 10.5,
    lineHeight: 15,
  },
  notesText: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 10.5,
    lineHeight: 15,
  },
  actions: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    flexGrow: 1,
  },
  actionButtonDanger: {
    borderColor: 'rgba(255,154,138,0.24)',
    backgroundColor: 'rgba(255,154,138,0.07)',
  },
  actionButtonDisabled: {
    opacity: 0.52,
  },
  actionText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8,
    letterSpacing: 0.75,
  },
  actionTextDanger: {
    color: '#FF9A8A',
  },
  actionTextDisabled: {
    color: TACTICAL.textMuted,
  },
});
