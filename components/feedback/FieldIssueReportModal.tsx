import React, { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import TacticalPopupShell from '../TacticalPopupShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { submitFieldIssueReport } from '../../lib/ecsIssueIntelligence';

const CATEGORIES = [
  'Navigation',
  'GPS',
  'Bluetooth / Telemetry',
  'Dashboard Widgets',
  'Explore',
  'Weather',
  'Vehicle Display',
  'Other',
];

export default function FieldIssueReportModal({
  visible,
  onClose,
  colors,
  onToast,
}: {
  visible: boolean;
  onClose: () => void;
  colors: any;
  onToast: (message: string) => void;
}) {
  const [category, setCategory] = useState<string>('Navigation');
  const [description, setDescription] = useState('');
  const [screenshotAttached, setScreenshotAttached] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.footerBtn, styles.footerSecondary, { borderColor: colors.border }]}
          onPress={onClose}
          activeOpacity={0.8}
          disabled={submitting}
        >
          <Text style={[styles.footerSecondaryText, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerBtn, styles.footerPrimary, { backgroundColor: submitting ? colors.goldMuted : colors.gold }]}
          onPress={async () => {
            setSubmitting(true);
            const result = await submitFieldIssueReport({
              category,
              description,
              screenshotAttached,
            });
            setSubmitting(false);
            if (!result.ok) {
              onToast(result.error || 'Unable to send field report');
              return;
            }
            setDescription('');
            setScreenshotAttached(false);
            onClose();
            onToast('Field report sent');
          }}
          activeOpacity={0.8}
          disabled={submitting}
        >
          <Ionicons name={submitting ? 'sync-outline' : 'send-outline'} size={15} color="#000" />
          <Text style={styles.footerPrimaryText}>{submitting ? 'Sending...' : 'Send Report'}</Text>
        </TouchableOpacity>
      </View>
    ),
    [category, colors.border, colors.gold, colors.goldMuted, colors.textSecondary, description, onClose, onToast, screenshotAttached, submitting],
  );

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Report Field Issue"
      icon="bug-outline"
      eyebrow="FIELD FEEDBACK"
      subtitle="Short, structured reports feed the ECS stability intelligence pipeline without sending raw device identity."
      overlayClass="editor"
      maxWidth={680}
      minHeightFraction={0.56}
      maxHeightFraction={0.82}
      footer={footer}
    >
      <View style={styles.body}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
        <View style={styles.categoryWrap}>
          {CATEGORIES.map((item) => {
            const selected = item === category;
            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.categoryPill,
                  {
                    borderColor: selected ? colors.gold : colors.border,
                    backgroundColor: selected ? colors.goldMuted : colors.bgInput,
                  },
                ]}
                onPress={() => setCategory(item)}
                activeOpacity={0.8}
              >
                <Text style={[styles.categoryPillText, { color: selected ? colors.gold : colors.textSecondary }]}>
                  {item.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>What happened?</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional short description of the failure, degraded state, or route problem."
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          maxLength={420}
        />

        <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.bgInput }]}>
          <View style={styles.toggleCopy}>
            <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>Screenshot captured separately</Text>
            <Text style={[styles.toggleText, { color: colors.textMuted }]}>
              Mark this if you already captured a screenshot through your normal ECS support workflow.
            </Text>
          </View>
          <Switch
            value={screenshotAttached}
            onValueChange={setScreenshotAttached}
            trackColor={{ false: 'rgba(255,255,255,0.08)', true: colors.gold + '40' }}
            thumbColor={screenshotAttached ? colors.gold : colors.textMuted}
          />
        </View>
      </View>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  categoryPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 130, padding: 12, fontSize: 14, lineHeight: 20 },
  toggleRow: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 12 },
  toggleCopy: { flex: 1, gap: 4 },
  toggleTitle: { fontSize: 13, fontWeight: '700' },
  toggleText: { fontSize: 11, lineHeight: 17 },
  footer: { flexDirection: 'row', gap: 10 },
  footerBtn: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  footerSecondary: { borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.02)' },
  footerSecondaryText: { fontSize: 12, fontWeight: '700' },
  footerPrimary: {},
  footerPrimaryText: { color: '#000', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
});
