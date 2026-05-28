import React from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import type { EstablishedCampsite } from '../../lib/map/establishedCampsiteTypes';
import {
  formatCampgroundAvailabilityLabel,
  formatCampgroundStatusLabel,
} from '../../lib/map/establishedCampgroundMobile';
import { resolveEstablishedCampgroundScore } from '../../lib/map/establishedCampgroundScore';

type Props = {
  visible: boolean;
  campsite: EstablishedCampsite | null;
  topOffset: number;
  bottomOffset: number;
  onClose: () => void;
  onNavigate: (campsite: EstablishedCampsite) => void;
};

const VERIFY_WARNING =
  'Availability, fees, seasons, and restrictions may change. Verify current details with the campground operator before travel.';

const WEB_SCROLL_CONTAINMENT_STYLE =
  Platform.OS === 'web'
    ? ({
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
      } as any)
    : null;

function words(value?: string): string {
  const normalized = String(value ?? 'unknown').replace(/_/g, ' ').trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function sourceLabel(value?: string): string {
  switch (String(value ?? '').toUpperCase()) {
    case 'RIDB':
    case 'RECREATION_GOV':
      return 'Recreation.gov';
    case 'NPS':
      return 'NPS';
    case 'CAMPFLARE':
      return 'Campflare';
    case 'ACTIVE':
      return 'ACTIVE';
    case 'RESERVEAMERICA':
      return 'ReserveAmerica';
    case 'ASPIRA':
      return 'Aspira';
    case 'OSM':
      return 'OSM';
    case 'STATE':
      return 'State';
    case 'COUNTY':
      return 'County';
    case 'PRIVATE':
      return 'Private';
    default:
      return 'Unknown';
  }
}

function boolLabel(value?: boolean): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Unknown';
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value == null || value === '' ? 'Not supplied by source' : String(value)}</Text>
    </View>
  );
}

function reservationCopy(campsite: EstablishedCampsite, reservationUrl?: string | null): string {
  if (reservationUrl) return 'Reservation / info link available';
  switch (campsite.reservationStatus) {
    case 'reservable':
      return 'Reservable source reported';
    case 'first_come':
      return 'First come / first served reported';
    case 'mixed':
      return 'Mixed reservable and first come reported';
    case 'required':
      return 'Reservation required';
    default:
      return 'Not supplied by source';
  }
}

function siteCountCopy(value?: number | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return `${Math.round(value)} sites`;
}

function stayTypeCopy(campsite: EstablishedCampsite): string | null {
  const values = [boolLabel(campsite.tentAllowed), boolLabel(campsite.rvAllowed), boolLabel(campsite.trailersAllowed)];
  return values.every((value) => value === 'Unknown') ? null : values.join(' / ');
}

export default function EstablishedCampsiteSheet({
  visible,
  campsite,
  topOffset,
  bottomOffset,
  onClose,
  onNavigate,
}: Props) {
  if (!visible || !campsite) return null;

  const amenities = campsite.amenities.filter((amenity) => amenity !== 'unknown');
  const sourceDate = formatDate(campsite.sourceUpdatedAt || campsite.lastSyncedAt || undefined);
  const availabilityDate = formatDate(campsite.lastAvailabilityCheckedAt || undefined);
  const verifiedDate = formatDate(campsite.lastVerifiedAt || undefined);
  const siteTypes = campsite.siteTypes?.length ? campsite.siteTypes : [campsite.campsiteType];
  const reservationUrl = campsite.reservationUrl || campsite.bookingUrl;
  const detailUrl = campsite.detailUrl || campsite.bookingUrl;
  const statusLabel = formatCampgroundStatusLabel(campsite.status);
  const availabilityLabel = formatCampgroundAvailabilityLabel(
    campsite.availabilityStatus,
    campsite.lastAvailabilityCheckedAt,
  );
  const scoreSummary = resolveEstablishedCampgroundScore(campsite);
  const scrollContentStyle = WEB_SCROLL_CONTAINMENT_STYLE
    ? [styles.bodyContent, WEB_SCROLL_CONTAINMENT_STYLE]
    : styles.bodyContent;

  const openBooking = () => {
    if (!reservationUrl && !detailUrl) return;
    void Linking.openURL(reservationUrl || detailUrl || '').catch(() => undefined);
  };

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
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Established Campground</Text>
              <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                {campsite.name}
              </Text>
              <Text style={styles.subtitle}>
                Known fixed campground. Verify availability before travel.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onClose}
              activeOpacity={0.78}
              accessibilityRole="button"
                accessibilityLabel="Close established campground details"
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
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>ECS SCORE</Text>
                <Text style={styles.badgeValue}>{scoreSummary.score}/100</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>Campground type</Text>
                <Text style={styles.badgeValue}>{words(campsite.campsiteType)}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>STATUS</Text>
                <Text style={styles.badgeValue}>{statusLabel}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>AVAILABILITY</Text>
                <Text style={styles.badgeValue}>{availabilityLabel}</Text>
              </View>
            </View>

            <View style={styles.scoreCard}>
              <View style={styles.scoreCardHeader}>
                <Ionicons name="sparkles-outline" size={13} color={TACTICAL.amber} />
                <Text style={styles.scoreCardTitle}>{scoreSummary.label} camp confidence</Text>
              </View>
              <Text style={styles.scoreCardText}>{scoreSummary.explanation}</Text>
              {campsite.liveDetailFetchedAt ? (
                <Text style={styles.scoreCardMeta}>
                  Live detail refreshed {formatDate(campsite.liveDetailFetchedAt) ?? 'recently'}.
                </Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <DetailRow label="Managing agency" value={campsite.managingAgency || campsite.operatorName || sourceLabel(campsite.source)} />
              <DetailRow label="Managing org" value={campsite.managingOrg} />
              <DetailRow label="Source / attribution" value={campsite.attribution || sourceLabel(campsite.primaryProvider || campsite.source)} />
              <DetailRow label="Reservation" value={reservationCopy(campsite, reservationUrl)} />
              <DetailRow label="Site count" value={siteCountCopy(campsite.siteCount)} />
              <DetailRow label="Season / hours" value={campsite.seasonDescription || campsite.openingHours} />
              <DetailRow label="Max vehicle length" value={campsite.maxVehicleLengthFt ? `${campsite.maxVehicleLengthFt} ft` : null} />
              <DetailRow label="Tent / RV / trailers" value={stayTypeCopy(campsite)} />
              <DetailRow label="Contact" value={campsite.phone} />
              {sourceDate ? <DetailRow label="Last updated" value={sourceDate} /> : null}
              {availabilityDate ? <DetailRow label="Last checked" value={availabilityDate} /> : null}
              {verifiedDate ? <DetailRow label="Last verified" value={verifiedDate} /> : null}
              {typeof campsite.sourceRecordCount === 'number' ? <DetailRow label="Source records" value={campsite.sourceRecordCount} /> : null}
              {typeof campsite.availabilityRecordCount === 'number' ? <DetailRow label="Availability rows" value={campsite.availabilityRecordCount} /> : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Site types</Text>
              <View style={styles.chipWrap}>
                {siteTypes.map((siteType) => (
                  <View key={siteType} style={styles.chip}>
                    <Text style={styles.chipText}>{words(siteType)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Amenities</Text>
              {amenities.length > 0 ? (
                <View style={styles.chipWrap}>
                  {amenities.map((amenity) => (
                    <View key={amenity} style={styles.chip}>
                      <Text style={styles.chipText}>{words(amenity)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyDetailText}>Amenities not supplied by the current source.</Text>
              )}
            </View>

            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.warningText}>{VERIFY_WARNING}</Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.secondaryButton, !reservationUrl && !detailUrl && styles.disabledButton]}
              activeOpacity={0.78}
              disabled={!reservationUrl && !detailUrl}
              onPress={openBooking}
              accessibilityRole="button"
              accessibilityLabel="Open campground reservation or information"
            >
              <Text style={styles.secondaryButtonText}>Reservation / info</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => onNavigate(campsite)}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel={`Navigate to ${campsite.name}`}
            >
              <Ionicons name="navigate-outline" size={13} color="#091014" />
              <Text style={styles.primaryButtonText}>Navigate</Text>
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
    zIndex: 77,
    elevation: 77,
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
    borderColor: 'rgba(242,194,77,0.34)',
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
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    textTransform: 'uppercase',
  },
  title: {
    ...TYPO.T3,
    color: TACTICAL.text,
  },
  subtitle: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 13,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  body: {
    maxHeight: 360,
  },
  bodyContent: {
    padding: 12,
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.2)',
    backgroundColor: 'rgba(242,194,77,0.08)',
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  badgeLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  badgeValue: {
    ...TYPO.B2,
    color: TACTICAL.text,
    marginTop: 3,
    fontSize: 13,
  },
  scoreCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(196,138,44,0.07)',
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 6,
  },
  scoreCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  scoreCardTitle: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  scoreCardText: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 16,
  },
  scoreCardMeta: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    ...TYPO.B2,
    color: TACTICAL.amber,
    fontWeight: '700',
    fontSize: 13,
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
    flex: 0.44,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  detailValue: {
    ...TYPO.B2,
    color: TACTICAL.text,
    flex: 0.56,
    textAlign: 'right',
    fontSize: 13,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  chipText: {
    ...TYPO.U2,
    color: TACTICAL.text,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  emptyDetailText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.28)',
    backgroundColor: 'rgba(242,194,77,0.08)',
    padding: 10,
  },
  warningText: {
    ...TYPO.B2,
    color: TACTICAL.text,
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(242,194,77,0.14)',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  disabledButton: {
    opacity: 0.48,
  },
  secondaryButtonText: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontWeight: '700',
    fontSize: 13,
  },
  primaryButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    backgroundColor: TACTICAL.amber,
  },
  primaryButtonText: {
    ...TYPO.B2,
    color: '#091015',
    fontWeight: '800',
    fontSize: 13,
  },
});
