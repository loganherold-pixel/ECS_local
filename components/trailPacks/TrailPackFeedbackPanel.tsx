import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import TacticalPopupShell from '../TacticalPopupShell';
import { ECSOverlayFooter } from '../ECSModalShell';
import { ECS, TACTICAL } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import {
  mapTrailPackIssueReasonToFeedbackType,
  type ECSTrailPackFeedbackResult,
  type ECSTrailPackFeedbackType,
  type ECSTrailPackIssueReason,
} from '../../lib/explore/trailPackFeedback';

type TrailPackFeedbackPanelProps = {
  onSubmit: (type: ECSTrailPackFeedbackType, note?: string) => ECSTrailPackFeedbackResult;
};

const ISSUE_REASONS: {
  reason: ECSTrailPackIssueReason;
  label: string;
}[] = [
  { reason: 'blocked_route', label: 'Blocked route' },
  { reason: 'closure', label: 'Closure' },
  { reason: 'private_land', label: 'Private land' },
  { reason: 'unsafe_condition', label: 'Unsafe condition' },
  { reason: 'vehicle_mismatch', label: 'Vehicle mismatch' },
  { reason: 'inaccurate_route', label: 'Inaccurate route' },
  { reason: 'other', label: 'Other' },
];

function resultMessage(result: ECSTrailPackFeedbackResult): string {
  if (result.ok) return 'Trail Pack feedback recorded.';
  return result.reason;
}

export default function TrailPackFeedbackPanel({ onSubmit }: TrailPackFeedbackPanelProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [selectedIssueReason, setSelectedIssueReason] = useState<ECSTrailPackIssueReason>('blocked_route');
  const [issueNote, setIssueNote] = useState('');

  const selectedIssueType = useMemo(
    () => mapTrailPackIssueReasonToFeedbackType(selectedIssueReason),
    [selectedIssueReason],
  );

  const submit = (type: ECSTrailPackFeedbackType, note?: string) => {
    hapticMicro();
    const result = onSubmit(type, note);
    setStatus(resultMessage(result));
    return result;
  };

  const submitIssue = () => {
    const result = submit(selectedIssueType, issueNote);
    if (result.ok) {
      setIssueNote('');
      setIssueModalVisible(false);
    }
  };

  return (
    <>
      <View style={s.panel}>
        <View style={s.actionRow}>
          <TouchableOpacity
            style={s.feedbackButton}
            activeOpacity={0.78}
            onPress={() => submit('completed')}
          >
            <Ionicons name="checkmark-circle-outline" size={13} color={TACTICAL.amber} />
            <Text style={s.feedbackButtonText}>COMPLETED</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.feedbackButton}
            activeOpacity={0.78}
            onPress={() => submit('recommended')}
          >
            <Ionicons name="thumbs-up-outline" size={13} color={TACTICAL.amber} />
            <Text style={s.feedbackButtonText}>RECOMMEND</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.feedbackButton, s.issueButton]}
            activeOpacity={0.78}
            onPress={() => {
              hapticMicro();
              setIssueModalVisible(true);
            }}
          >
            <Ionicons name="alert-circle-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={s.issueButtonText}>REPORT ISSUE</Text>
          </TouchableOpacity>
        </View>

        {status ? <Text style={s.statusText} numberOfLines={2}>{status}</Text> : null}
      </View>

      <TacticalPopupShell
        visible={issueModalVisible}
        onClose={() => setIssueModalVisible(false)}
        title="Report Trail Pack Issue"
        subtitle="Structured route feedback"
        eyebrow="Trail Pack"
        icon="alert-circle-outline"
        stackBehavior="allow-stack"
        maxWidth={520}
        maxHeightFraction={0.82}
        keyboardAware
        footer={(
          <ECSOverlayFooter>
            <TouchableOpacity
              style={s.modalSecondaryButton}
              activeOpacity={0.8}
              onPress={() => setIssueModalVisible(false)}
            >
              <Text style={s.modalSecondaryText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.modalPrimaryButton}
              activeOpacity={0.84}
              onPress={submitIssue}
            >
              <Text style={s.modalPrimaryText}>SUBMIT</Text>
            </TouchableOpacity>
          </ECSOverlayFooter>
        )}
      >
        <View style={s.modalBody}>
          <Text style={s.modalIntro}>
            Pick the closest operational reason. ECS uses this to adjust confidence and flag review when needed.
          </Text>

          <View style={s.reasonGrid}>
            {ISSUE_REASONS.map((item) => {
              const selected = item.reason === selectedIssueReason;
              return (
                <TouchableOpacity
                  key={item.reason}
                  style={[s.reasonButton, selected && s.reasonButtonSelected]}
                  activeOpacity={0.78}
                  onPress={() => setSelectedIssueReason(item.reason)}
                >
                  <Text style={[s.reasonButtonText, selected && s.reasonButtonTextSelected]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            value={issueNote}
            onChangeText={setIssueNote}
            placeholder="Optional note"
            placeholderTextColor={TACTICAL.textMuted}
            style={s.noteInput}
            multiline
            maxLength={240}
            textAlignVertical="top"
          />
        </View>
      </TacticalPopupShell>
    </>
  );
}

const s = StyleSheet.create({
  panel: {
    flex: 1,
    minWidth: 260,
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  feedbackButton: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0D',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  feedbackButtonText: {
    color: TACTICAL.amber,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  issueButton: {
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  issueButtonText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  statusText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  modalBody: {
    padding: 14,
    gap: 12,
  },
  modalIntro: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    justifyContent: 'center',
  },
  reasonButtonSelected: {
    borderColor: TACTICAL.amber + '40',
    backgroundColor: TACTICAL.amber + '12',
  },
  reasonButtonText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  reasonButtonTextSelected: {
    color: TACTICAL.amber,
  },
  noteInput: {
    minHeight: 84,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    color: TACTICAL.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  modalSecondaryButton: {
    minHeight: 38,
    minWidth: 104,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  modalSecondaryText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  modalPrimaryButton: {
    minHeight: 38,
    minWidth: 116,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '10',
  },
  modalPrimaryText: {
    color: TACTICAL.amber,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
