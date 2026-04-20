/**
 * CollaborativeIntelPanel — Phase 12 UI Component
 *
 * Displays community-driven expedition intelligence:
 *   - Nearby observations (hazards, campsites, fuel, etc.)
 *   - Observation type summary
 *   - Submit new observation
 *   - Pending upload queue
 *
 * Driver-safe: short labels, simple cards, minimal interaction.
 * Appears in the ExpeditionDrive Status screen.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { collaborativeExpeditionIntelligence } from '../../lib/collaborativeExpeditionIntelligence';
import type {
  CollaborativeIntelOutput,
  CollaborativeObservation,
  CollaborativeObservationType,
} from '../../lib/collaborativeIntelTypes';
import {
  OBSERVATION_TYPE_LABELS,
  OBSERVATION_TYPE_SHORT_LABELS,
  OBSERVATION_TYPE_ICONS,
  OBSERVATION_TYPE_COLORS,
  OBSERVATION_TYPE_BG_COLORS,
  CONFIDENCE_LABELS,
  CONFIDENCE_COLORS,
  ALL_OBSERVATION_TYPES,
} from '../../lib/collaborativeIntelTypes';

export default function CollaborativeIntelPanel() {
  const [output, setOutput] = useState<CollaborativeIntelOutput>(
    collaborativeExpeditionIntelligence.get()
  );
  const [showSubmit, setShowSubmit] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const unsub = collaborativeExpeditionIntelligence.subscribe(() => {
      setOutput(collaborativeExpeditionIntelligence.get());
    });
    return unsub;
  }, []);

  if (!output.isActive) return null;

  const { summary, nearbyObservations, pendingCount, isCached, isOnline, isFetching } = output;
  const displayObs = showAll ? nearbyObservations : nearbyObservations.slice(0, 4);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="people-outline" size={16} color="#5AC8FA" />
          <Text style={styles.headerTitle}>COMMUNITY INTEL</Text>
          {summary.totalCount > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{summary.totalCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {isFetching && (
            <Text style={styles.fetchingText}>SYNCING</Text>
          )}
          {isCached && !isFetching && (
            <View style={styles.cachedBadge}>
              <Ionicons name="cloud-offline-outline" size={10} color="#8B949E" />
              <Text style={styles.cachedText}>CACHED</Text>
            </View>
          )}
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Ionicons name="cloud-upload-outline" size={10} color="#FFB300" />
              <Text style={styles.pendingText}>{pendingCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Type Summary Bar */}
      {summary.totalCount > 0 && (
        <View style={styles.summaryBar}>
          {summary.hazardCount > 0 && (
            <TypeChip type="hazard" count={summary.hazardCount} />
          )}
          {summary.trailDifficultyCount > 0 && (
            <TypeChip type="trail_difficulty" count={summary.trailDifficultyCount} />
          )}
          {summary.waterCrossingCount > 0 && (
            <TypeChip type="water_crossing" count={summary.waterCrossingCount} />
          )}
          {summary.campsiteCount > 0 && (
            <TypeChip type="campsite" count={summary.campsiteCount} />
          )}
          {summary.fuelCount > 0 && (
            <TypeChip type="fuel_availability" count={summary.fuelCount} />
          )}
          {summary.blockedRouteCount > 0 && (
            <TypeChip type="blocked_route" count={summary.blockedRouteCount} />
          )}
        </View>
      )}

      {/* Observations List */}
      {displayObs.length > 0 ? (
        <View style={styles.observationsList}>
          {displayObs.map((obs) => (
            <ObservationCard
              key={obs.id}
              observation={obs}
              onConfirm={() => collaborativeExpeditionIntelligence.confirmObservation(obs.id)}
            />
          ))}
          {nearbyObservations.length > 4 && !showAll && (
            <TouchableOpacity
              style={styles.showAllBtn}
              onPress={() => setShowAll(true)}
            >
              <Text style={styles.showAllText}>
                Show all {nearbyObservations.length} observations
              </Text>
              <Ionicons name="chevron-down-outline" size={14} color="#5AC8FA" />
            </TouchableOpacity>
          )}
          {showAll && nearbyObservations.length > 4 && (
            <TouchableOpacity
              style={styles.showAllBtn}
              onPress={() => setShowAll(false)}
            >
              <Text style={styles.showAllText}>Show less</Text>
              <Ionicons name="chevron-up-outline" size={14} color="#5AC8FA" />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="earth-outline" size={20} color="#555" />
          <Text style={styles.emptyText}>No community reports nearby</Text>
        </View>
      )}

      {/* Submit Button */}
      <TouchableOpacity
        style={styles.submitToggle}
        onPress={() => setShowSubmit(!showSubmit)}
      >
        <Ionicons
          name={showSubmit ? 'close-outline' : 'add-circle-outline'}
          size={16}
          color="#5AC8FA"
        />
        <Text style={styles.submitToggleText}>
          {showSubmit ? 'CANCEL' : 'REPORT OBSERVATION'}
        </Text>
      </TouchableOpacity>

      {/* Submit Form */}
      {showSubmit && (
        <SubmitObservationForm
          onSubmitted={() => setShowSubmit(false)}
        />
      )}
    </View>
  );
}

// ── Type Chip ───────────────────────────────────────────────

function TypeChip({ type, count }: { type: CollaborativeObservationType; count: number }) {
  const color = OBSERVATION_TYPE_COLORS[type];
  const bgColor = OBSERVATION_TYPE_BG_COLORS[type];
  const icon = OBSERVATION_TYPE_ICONS[type];
  const label = OBSERVATION_TYPE_SHORT_LABELS[type];

  return (
    <View style={[styles.typeChip, { backgroundColor: bgColor, borderColor: color + '40' }]}>
      <Ionicons name={icon as any} size={11} color={color} />
      <Text style={[styles.typeChipText, { color }]}>{count}</Text>
    </View>
  );
}

// ── Observation Card ────────────────────────────────────────

function ObservationCard({
  observation,
  onConfirm,
}: {
  observation: CollaborativeObservation;
  onConfirm: () => void;
}) {
  const type = observation.observation_type;
  const color = OBSERVATION_TYPE_COLORS[type];
  const icon = OBSERVATION_TYPE_ICONS[type];
  const label = OBSERVATION_TYPE_LABELS[type];
  const confLabel = CONFIDENCE_LABELS[observation.confidence_level] || 'Unknown';
  const confColor = CONFIDENCE_COLORS[observation.confidence_level] || '#8B949E';
  const distKm = observation.distance_km;

  return (
    <View style={[styles.obsCard, { borderLeftColor: color }]}>
      <View style={styles.obsCardHeader}>
        <Ionicons name={icon as any} size={14} color={color} />
        <Text style={[styles.obsCardType, { color }]}>{label}</Text>
        <View style={styles.obsCardMeta}>
          {distKm != null && (
            <Text style={styles.obsCardDist}>
              {distKm < 1 ? `${(distKm * 1000).toFixed(0)}m` : `${distKm.toFixed(1)}km`}
            </Text>
          )}
          <View style={[styles.confBadge, { borderColor: confColor + '50' }]}>
            <Text style={[styles.confText, { color: confColor }]}>{confLabel}</Text>
          </View>
        </View>
      </View>
      {observation.description ? (
        <Text style={styles.obsCardDesc} numberOfLines={2}>
          {observation.description}
        </Text>
      ) : null}
      <View style={styles.obsCardFooter}>
        <Text style={styles.obsCardAge}>
          {formatAge(observation.created_at)}
        </Text>
        {observation.report_count > 1 && (
          <Text style={styles.obsCardReports}>
            {observation.report_count} reports
          </Text>
        )}
        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={onConfirm}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="thumbs-up-outline" size={12} color="#5AC8FA" />
          <Text style={styles.confirmText}>CONFIRM</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Submit Form ─────────────────────────────────────────────

function SubmitObservationForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [selectedType, setSelectedType] = useState<CollaborativeObservationType | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!selectedType) {
      Alert.alert('Select Type', 'Please select an observation type.');
      return;
    }

    // Get current GPS position
    let lat: number | null = null;
    let lng: number | null = null;
    let altFt: number | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { gpsUIState } = require('../../lib/gpsUIState');
      const gps = gpsUIState.get();
      if (gps.hasFix && gps.position) {
        lat = gps.position.latitude;
        lng = gps.position.longitude;
        altFt = gps.position.altitudeFt ?? null;
      }
    } catch {}

    if (lat == null || lng == null) {
      Alert.alert('No GPS', 'Cannot submit observation without GPS position.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await collaborativeExpeditionIntelligence.submitObservation({
        latitude: lat,
        longitude: lng,
        observation_type: selectedType,
        description: description.trim(),
        altitude_ft: altFt,
      });

      if (result.success) {
        Alert.alert('Submitted', 'Observation shared with the community.');
      } else if (result.queued) {
        Alert.alert('Queued', 'Observation saved. Will upload when online.');
      }

      setSelectedType(null);
      setDescription('');
      onSubmitted();
    } catch {
      Alert.alert('Error', 'Failed to submit observation.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedType, description, onSubmitted]);

  return (
    <View style={styles.submitForm}>
      <Text style={styles.submitFormTitle}>REPORT OBSERVATION</Text>

      {/* Type Selection */}
      <View style={styles.typeGrid}>
        {ALL_OBSERVATION_TYPES.map((type) => {
          const isSelected = selectedType === type;
          const color = OBSERVATION_TYPE_COLORS[type];
          const bgColor = OBSERVATION_TYPE_BG_COLORS[type];
          const icon = OBSERVATION_TYPE_ICONS[type];
          const label = OBSERVATION_TYPE_SHORT_LABELS[type];

          return (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeOption,
                isSelected && { backgroundColor: bgColor, borderColor: color },
              ]}
              onPress={() => setSelectedType(type)}
            >
              <Ionicons
                name={icon as any}
                size={16}
                color={isSelected ? color : '#8B949E'}
              />
              <Text style={[
                styles.typeOptionText,
                isSelected && { color },
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Description */}
      <TextInput
        style={styles.descInput}
        value={description}
        onChangeText={setDescription}
        placeholder="Brief description (optional)..."
        placeholderTextColor="#555"
        maxLength={200}
        multiline
        numberOfLines={2}
      />

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitBtn, !selectedType && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!selectedType || submitting}
      >
        <Ionicons
          name="cloud-upload-outline"
          size={16}
          color={selectedType ? '#0B0E12' : '#555'}
        />
        <Text style={[styles.submitBtnText, !selectedType && { color: '#555' }]}>
          {submitting ? 'SUBMITTING...' : 'SHARE OBSERVATION'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function formatAge(isoDate: string): string {
  try {
    const ms = Date.now() - new Date(isoDate).getTime();
    const hours = ms / (1000 * 60 * 60);
    if (hours < 1) return `${Math.round(hours * 60)}m ago`;
    if (hours < 24) return `${Math.round(hours)}h ago`;
    const days = Math.round(hours / 24);
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  } catch { return ''; }
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111418',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E232B',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(90,200,250,0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#5AC8FA',
  },
  countBadge: {
    backgroundColor: 'rgba(90,200,250,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(90,200,250,0.3)',
  },
  countText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#5AC8FA',
    fontFamily: 'Courier',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fetchingText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#5AC8FA',
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(139,148,158,0.1)',
  },
  cachedText: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8B949E',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,179,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.25)',
  },
  pendingText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFB300',
    fontFamily: 'Courier',
  },

  // Summary bar
  summaryBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  typeChipText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Courier',
  },

  // Observations list
  observationsList: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  obsCard: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    marginBottom: 2,
  },
  obsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  obsCardType: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
  },
  obsCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  obsCardDist: {
    fontSize: 10,
    fontWeight: '600',
    color: '#D4A017',
    fontFamily: 'Courier',
  },
  confBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  confText: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  obsCardDesc: {
    fontSize: 11,
    fontWeight: '400',
    color: '#8B949E',
    marginTop: 4,
    lineHeight: 16,
  },
  obsCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  obsCardAge: {
    fontSize: 9,
    fontWeight: '500',
    color: '#555',
  },
  obsCardReports: {
    fontSize: 9,
    fontWeight: '600',
    color: '#8B949E',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(90,200,250,0.25)',
    backgroundColor: 'rgba(90,200,250,0.06)',
  },
  confirmText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#5AC8FA',
  },

  showAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  showAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5AC8FA',
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  emptyText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#555',
  },

  // Submit toggle
  submitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  submitToggleText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#5AC8FA',
  },

  // Submit form
  submitForm: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(90,200,250,0.1)',
  },
  submitFormTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#8B949E',
    marginTop: 10,
    marginBottom: 8,
    textAlign: 'center',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E232B',
    backgroundColor: '#0B0E12',
  },
  typeOptionText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8B949E',
  },
  descInput: {
    backgroundColor: '#0B0E12',
    borderWidth: 1,
    borderColor: '#1E232B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#E6EDF3',
    fontSize: 12,
    marginBottom: 10,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#5AC8FA',
  },
  submitBtnDisabled: {
    backgroundColor: '#1E232B',
  },
  submitBtnText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    color: '#0B0E12',
  },
});





