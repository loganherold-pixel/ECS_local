import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../../context/ThemeContext';
import type { ConvoyMapVehicle } from '../../lib/convoy/convoyRealtimeService';
import {
  buildConvoyMarkerIdentity,
  type ConvoyMarkerIdentity,
} from '../../lib/convoy/convoyMarkerIdentity';

interface ConvoyMemberMarkerProps {
  member: ConvoyMapVehicle;
  identity?: ConvoyMarkerIdentity;
  selected?: boolean;
  currentUser?: boolean;
  onPress?: (member: ConvoyMapVehicle) => void;
}

export function ConvoyMemberMarker({
  member,
  identity,
  selected = false,
  currentUser = false,
  onPress,
}: ConvoyMemberMarkerProps) {
  const { palette } = useTheme();
  const markerIdentity = identity ?? buildConvoyMarkerIdentity(member, 0, currentUser ? member.memberId : null);
  const isAlert = markerIdentity.status === 'needs_assistance';
  const isMuted = markerIdentity.status === 'stale' || markerIdentity.status === 'offline';
  const accent = isAlert ? palette.danger : selected || currentUser ? palette.amber : palette.borderFocus;
  const textColor = isMuted ? palette.textMuted : palette.text;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => onPress?.(member)}
      accessibilityRole="button"
      accessibilityLabel={`${markerIdentity.label}, ${markerIdentity.role}, ${markerIdentity.statusLabel}`}
      style={[
        styles.marker,
        {
          backgroundColor: palette.panel,
          borderColor: accent,
          opacity: isMuted ? 0.72 : 1,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text numberOfLines={1} style={[styles.callsign, { color: textColor }]}>
        {markerIdentity.label}
      </Text>
      <Text numberOfLines={1} style={[styles.status, { color: accent }]}>
        {markerIdentity.statusLabel}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  marker: {
    minWidth: 86,
    maxWidth: 126,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    position: 'absolute',
    top: 7,
    right: 7,
  },
  callsign: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  status: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});

export default ConvoyMemberMarker;
