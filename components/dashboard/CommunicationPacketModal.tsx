import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import TacticalPopupShell from '../TacticalPopupShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { EXPEDITION_FULL_BODY_POPUP_PROPS } from './expeditionPopupLayout';
import type { IncidentContext } from '../../lib/types/incidentRecovery';
import type { IncidentCommunicationPacketAudience } from '../../lib/incidentCommunicationPacket';

type PacketAudience = IncidentCommunicationPacketAudience | 'all';

type CommunicationPacketModalProps = {
  visible: boolean;
  onClose: () => void;
  incident?: IncidentContext | null;
  onCopyPacket: (audience: PacketAudience) => void;
};

function copyTextIfAvailable(text: string): void {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const clipboard = nav && 'clipboard' in nav ? (nav as any).clipboard : null;
  if (clipboard?.writeText) {
    clipboard.writeText(text).catch(() => undefined);
  }
}

export default function CommunicationPacketModal({
  visible,
  onClose,
  incident,
  onCopyPacket,
}: CommunicationPacketModalProps) {
  const packets = useMemo(
    () => incident?.communicationPacket?.audiencePackets ?? [],
    [incident?.communicationPacket?.audiencePackets],
  );
  const [selectedAudience, setSelectedAudience] = useState<PacketAudience>('all');
  const selectedText = useMemo(() => {
    if (!incident?.communicationPacket) return '';
    if (selectedAudience === 'all') return incident.communicationPacket.packetText ?? '';
    return packets.find((packet) => packet.audience === selectedAudience)?.text ?? '';
  }, [incident?.communicationPacket, packets, selectedAudience]);

  const footer = (
    <View style={styles.footer}>
      <TouchableOpacity style={[styles.footerButton, styles.secondaryButton]} onPress={onClose} activeOpacity={0.78}>
        <Text style={styles.secondaryButtonText}>Close</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerButton, styles.primaryButton, !selectedText && styles.buttonDisabled]}
        disabled={!selectedText}
        onPress={() => {
          copyTextIfAvailable(selectedText);
          onCopyPacket(selectedAudience);
        }}
        activeOpacity={0.78}
      >
        <Ionicons name="copy-outline" size={15} color="#050608" />
        <Text style={styles.primaryButtonText}>Copy Packet</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Communication Packet"
      icon="radio-outline"
      eyebrow="INCIDENT & RECOVERY"
      subtitle="Concise copyable incident packet. Sending this does not replace emergency services or local authorities."
      overlayClass="workflow"
      {...EXPEDITION_FULL_BODY_POPUP_PROPS}
      footer={footer}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!incident ? (
          <View style={styles.section}>
            <Text style={styles.emptyTitle}>No active incident</Text>
            <Text style={styles.emptyText}>
              Report an incident first to generate a Communication Packet. ECS will not fabricate an active incident.
            </Text>
          </View>
        ) : !incident.communicationPacket ? (
          <View style={styles.section}>
            <Text style={styles.emptyTitle}>Packet pending</Text>
            <Text style={styles.emptyText}>
              Tap Communication Packet from the Incident & Recovery container again to generate the latest packet.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>{incident.communicationPacket.summary}</Text>
              <Text style={styles.summaryText}>
                {incident.communicationPacket.recommendedAction ?? 'Copy and send only through appropriate channels.'}
              </Text>
            </View>

            <View style={styles.audienceRow}>
              <TouchableOpacity
                style={[styles.audienceButton, selectedAudience === 'all' && styles.audienceButtonSelected]}
                onPress={() => setSelectedAudience('all')}
                activeOpacity={0.78}
              >
                <Text style={[styles.audienceText, selectedAudience === 'all' && styles.audienceTextSelected]}>
                  All
                </Text>
              </TouchableOpacity>
              {packets.map((packet) => (
                <TouchableOpacity
                  key={packet.audience}
                  style={[styles.audienceButton, selectedAudience === packet.audience && styles.audienceButtonSelected]}
                  onPress={() => setSelectedAudience(packet.audience)}
                  activeOpacity={0.78}
                >
                  <Text style={[styles.audienceText, selectedAudience === packet.audience && styles.audienceTextSelected]}>
                    {packet.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.packetBox}>
              <Text selectable style={styles.packetText}>{selectedText}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.62)',
    padding: 12,
    gap: 8,
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  emptyText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  summary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.78)',
    padding: 12,
    gap: 6,
  },
  summaryTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  summaryText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  audienceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  audienceButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  audienceButtonSelected: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  audienceText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  audienceTextSelected: {
    color: TACTICAL.amber,
  },
  packetBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(5,7,10,0.78)',
    padding: 12,
  },
  packetText: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
  },
  secondaryButtonText: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  primaryButton: {
    backgroundColor: TACTICAL.amber,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#050608',
    fontSize: 11,
    fontWeight: '900',
  },
});
