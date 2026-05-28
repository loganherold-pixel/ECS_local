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
import { useExpeditionFullBodyPopupProps } from './expeditionPopupLayout';
import type { IncidentContext } from '../../lib/types/incidentRecovery';
import type { IncidentCommunicationPacketAudience } from '../../lib/incidentCommunicationPacket';
import { exportIncidentCommunicationPacketPdf } from '../../lib/incidentCommunicationPacketPdfExport';
import { copyTextToClipboard } from '../../lib/clipboard';

type PacketAudience = IncidentCommunicationPacketAudience | 'all';

type CommunicationPacketModalProps = {
  visible: boolean;
  onClose: () => void;
  incident?: IncidentContext | null;
  onCopyPacket: (audience: PacketAudience) => void;
};

export default function CommunicationPacketModal({
  visible,
  onClose,
  incident,
  onCopyPacket,
}: CommunicationPacketModalProps) {
  const fullBodyPopupProps = useExpeditionFullBodyPopupProps();
  const packets = useMemo(
    () => incident?.communicationPacket?.audiencePackets ?? [],
    [incident?.communicationPacket?.audiencePackets],
  );
  const [selectedAudience, setSelectedAudience] = useState<PacketAudience>('all');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [packetCopied, setPacketCopied] = useState(false);
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
        style={[styles.footerButton, styles.secondaryButton, (!incident?.communicationPacket || exportingPdf) && styles.buttonDisabled]}
        disabled={!incident?.communicationPacket || exportingPdf}
        onPress={async () => {
          if (!incident?.communicationPacket) return;
          setExportingPdf(true);
          setExportMessage(null);
          const result = await exportIncidentCommunicationPacketPdf(incident, selectedAudience);
          setExportingPdf(false);
          setExportMessage(result.success ? 'PDF ready to save or share.' : result.error ?? 'PDF export failed.');
        }}
        activeOpacity={0.78}
      >
        <Ionicons name="document-text-outline" size={15} color={TACTICAL.text} />
        <Text style={styles.secondaryButtonText} numberOfLines={1}>
          {exportingPdf ? 'Exporting...' : 'Download PDF'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerButton, styles.primaryButton, !selectedText && styles.buttonDisabled]}
        disabled={!selectedText}
        onPress={async () => {
          const copied = await copyTextToClipboard(selectedText);
          if (!copied) return;
          setPacketCopied(true);
          setTimeout(() => setPacketCopied(false), 1700);
          onCopyPacket(selectedAudience);
        }}
        activeOpacity={0.78}
      >
        <Ionicons name={packetCopied ? 'checkmark-circle-outline' : 'copy-outline'} size={15} color="#050608" />
        <Text style={styles.primaryButtonText}>{packetCopied ? 'Copied' : 'Copy Packet'}</Text>
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
      {...fullBodyPopupProps}
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
            {exportMessage ? (
              <Text style={styles.exportMessage}>{exportMessage}</Text>
            ) : null}
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
  exportMessage: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center',
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
