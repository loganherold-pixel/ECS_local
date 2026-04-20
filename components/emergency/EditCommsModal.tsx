import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import ECSConfirmDialog from '../ECSConfirmDialog';
import { ECSTransientNotice } from '../ECSLoading';
import { TACTICAL } from '../../lib/theme';
import { ECSButton, ECSIconButton } from '../ECSButton';
import ECSActionRow from '../ECSActionRow';
import { ECSFormSection, ECSInput, ECSValidationText } from '../ECSForm';
import { ECSResultsEmptyState, ECSResultsMetaRow } from '../ECSResults';
import { commsStore, type CommsEntry } from '../../lib/commsStore';
import TacticalPopupShell from '../TacticalPopupShell';
import { ECS_TEXT, ECS_TEXT_SPACING } from '../../lib/ecsTypographyTokens';

export type CommsColumnType = 'frequencies' | 'signals' | 'contacts';

interface Props {
  visible: boolean;
  columnType: CommsColumnType;
  defaultEntries: { label: string; detail: string }[];
  customEntries: CommsEntry[];
  onClose: () => void;
  onDataChanged: () => void;
}

type DraftEntry = {
  id: string;
  label: string;
  detail: string;
};

const COLUMN_CONFIG: Record<
  CommsColumnType,
  {
    title: string;
    icon: string;
    singularLabel: string;
    labelPlaceholder: string;
    detailPlaceholder: string;
    labelFieldName: string;
    detailFieldName: string;
    emptyCopy: string;
    emptyAction: string;
  }
> = {
  frequencies: {
    title: 'FREQUENCIES',
    icon: 'radio-outline',
    singularLabel: 'CHANNEL',
    labelPlaceholder: 'e.g. MURS Ch 1',
    detailPlaceholder: 'e.g. 151.820 MHz',
    labelFieldName: 'Channel',
    detailFieldName: 'Detail',
    emptyCopy: 'No saved frequencies yet',
    emptyAction: 'Add channel',
  },
  signals: {
    title: 'SIGNALS',
    icon: 'flash-outline',
    singularLabel: 'SIGNAL',
    labelPlaceholder: 'e.g. Mirror Flash',
    detailPlaceholder: 'e.g. 3 flashes',
    labelFieldName: 'Signal',
    detailFieldName: 'Detail',
    emptyCopy: 'No saved signals yet',
    emptyAction: 'Add signal',
  },
  contacts: {
    title: 'EMERGENCY NUMBERS',
    icon: 'call-outline',
    singularLabel: 'CONTACT',
    labelPlaceholder: 'e.g. Ranger Station',
    detailPlaceholder: 'e.g. 555-123-4567',
    labelFieldName: 'Name',
    detailFieldName: 'Phone Number',
    emptyCopy: 'No saved emergency numbers yet',
    emptyAction: 'Add contact',
  },
};

function createDraft(entries: CommsEntry[]): DraftEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    detail: entry.detail,
  }));
}

export default function EditCommsModal({
  visible,
  columnType,
  defaultEntries,
  customEntries,
  onClose,
  onDataChanged,
}: Props) {
  const config = COLUMN_CONFIG[columnType] ?? COLUMN_CONFIG.frequencies;
  const isContacts = columnType === 'contacts';
  const accentColor = isContacts ? TACTICAL.danger : TACTICAL.amber;

  const [draftEntries, setDraftEntries] = useState<DraftEntry[]>(() => createDraft(customEntries));
  const [newLabel, setNewLabel] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDiscardVisible, setConfirmDiscardVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraftEntries(createDraft(customEntries));
    setNewLabel('');
    setNewDetail('');
    setShowAddForm(false);
    setValidationError(null);
    setConfirmDiscardVisible(false);
    setIsSaving(false);
  }, [visible, customEntries, columnType]);

  const scrollAddFormIntoView = useCallback((animated = true) => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated });
    }, 80);
  }, []);

  useEffect(() => {
    if (!visible || !showAddForm) return;
    scrollAddFormIntoView(false);
  }, [scrollAddFormIntoView, showAddForm, visible]);

  const hasUnsavedChanges = useMemo(() => {
    const normalizedDraft = JSON.stringify(
      draftEntries.map((entry) => ({
        id: entry.id,
        label: entry.label.trim(),
        detail: entry.detail.trim() || '—',
      })),
    );
    const normalizedSaved = JSON.stringify(
      createDraft(customEntries).map((entry) => ({
        id: entry.id,
        label: entry.label.trim(),
        detail: entry.detail.trim() || '—',
      })),
    );

    return (
      normalizedDraft !== normalizedSaved
    );
  }, [customEntries, draftEntries]);

  const totalReferenceCount = defaultEntries.length + draftEntries.length;

  const headerStatus = (
    <View style={styles.headerStatusBadge}>
      <Ionicons
        name={isContacts ? 'cloud-offline-outline' : 'radio-outline'}
        size={11}
        color={accentColor}
      />
      <Text style={[styles.headerStatusText, { color: accentColor }]}>
        {`${totalReferenceCount} READY`}
      </Text>
    </View>
  );

  const updateDraftEntry = useCallback((id: string, field: 'label' | 'detail', value: string) => {
    setDraftEntries((entries) =>
      entries.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)),
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setDraftEntries((entries) => entries.filter((entry) => entry.id !== id));
    setValidationError(null);
  }, []);

  const handleAddDraft = useCallback(() => {
    const label = newLabel.trim();
    const detail = newDetail.trim();

    if (!label) {
      setValidationError(`${config.labelFieldName} is required before adding.`);
      return;
    }

    setDraftEntries((entries) => [
      ...entries,
      {
        id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        label,
        detail: detail || '—',
      },
    ]);
    setNewLabel('');
    setNewDetail('');
    setShowAddForm(false);
    setValidationError(null);
  }, [config.labelFieldName, newDetail, newLabel]);

  const closeWithoutSaving = useCallback(() => {
    setDraftEntries(createDraft(customEntries));
    setNewLabel('');
    setNewDetail('');
    setShowAddForm(false);
    setValidationError(null);
    setConfirmDiscardVisible(false);
    onClose();
  }, [customEntries, onClose]);

  const handleClose = useCallback(() => {
    if (isSaving) return;
    const hasPendingAdd = showAddForm && (newLabel.trim().length > 0 || newDetail.trim().length > 0);
    if (hasUnsavedChanges || hasPendingAdd) {
      setConfirmDiscardVisible(true);
      return;
    }

    closeWithoutSaving();
  }, [closeWithoutSaving, hasUnsavedChanges, isSaving, newDetail, newLabel, showAddForm]);

  const handleSave = useCallback(async () => {
    if (showAddForm && (newLabel.trim() || newDetail.trim())) {
      setValidationError(`Finish adding this ${config.singularLabel.toLowerCase()} or close the add form before saving.`);
      return;
    }

    const invalidEntry = draftEntries.find((entry) => !entry.label.trim());
    if (invalidEntry) {
      setValidationError(`${config.labelFieldName} cannot be blank.`);
      return;
    }

    const normalizedEntries: CommsEntry[] = draftEntries.map((entry) => ({
      id: entry.id,
      label: entry.label.trim(),
      detail: entry.detail.trim() || '—',
    }));

    setIsSaving(true);
    try {
      await Promise.resolve();
      commsStore.replaceColumn(columnType, normalizedEntries);
      onDataChanged();
      setValidationError(null);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [
    columnType,
    config.labelFieldName,
    config.singularLabel,
    draftEntries,
    newDetail,
    newLabel,
    onClose,
    onDataChanged,
    showAddForm,
    setIsSaving,
  ]);

  const footer = (
    <ECSActionRow>
      <ECSButton
        label="Cancel"
        variant="secondary"
        size="large"
        onPress={handleClose}
        disabled={isSaving}
        grow
      />
      <ECSButton
        label="Save"
        icon="save-outline"
        variant="primary"
        size="large"
        onPress={handleSave}
        disabled={!hasUnsavedChanges}
        loading={isSaving}
        grow
      />
    </ECSActionRow>
  );

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={handleClose}
      tier="global"
      title={`EDIT ${config.title}`}
      icon={config.icon as any}
      eyebrow="DISPATCH COMMS PANEL"
      subtitle="Review the baseline reference, update saved field entries, and keep Dispatch ready offline."
      maxWidth={780}
      maxHeightFraction={0.88}
      minHeightFraction={0.76}
      scrollable={false}
      keyboardAware
      overlayClass="editor"
      dismissOnBackdrop
      headerRight={headerStatus}
      footer={footer}
      bodyStyle={styles.shellBody}
    >
      <KeyboardAvoidingView
        style={styles.panelWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.introCard}>
          <View style={[styles.introIconWrap, isContacts && styles.introIconWrapDanger]}>
            <Ionicons name={config.icon as any} size={15} color={accentColor} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Saved entries</Text>
            <Text style={styles.introText}>
              Review current entries, update custom items, and save changes back to the comms reference.
            </Text>
          </View>
        </View>

        <ECSValidationText message={validationError} style={styles.validationBanner} />

        {isSaving ? (
          <ECSTransientNotice
            kind="saving"
            label="Saving Dispatch Setup..."
            message="Updating saved comms entries for this field reference."
            compact
            style={styles.savingNotice}
          />
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.scrollContent,
            showAddForm && styles.scrollContentWithAddForm,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          bounces={false}
        >
          <ECSFormSection
            title="Baseline Reference"
            helper="Locked entries stay in place so Dispatch always has a dependable field baseline."
            compact
          >
            {defaultEntries.map((entry, index) => (
              <View key={`default-${index}`} style={[styles.entryRow, isContacts && styles.entryRowContact]}>
                <View style={[styles.entryDot, isContacts && { backgroundColor: TACTICAL.danger }]} />
                <View style={styles.entryTextBlock}>
                  <Text style={styles.entryLabel}>{entry.label}</Text>
                  <Text style={[styles.entryDetail, isContacts && styles.entryDetailContact]}>{entry.detail}</Text>
                </View>
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={10} color="rgba(138,138,133,0.45)" />
                </View>
              </View>
            ))}
          </ECSFormSection>

          <ECSFormSection
            title="Saved Field Entries"
            helper="Add or edit the local entries Dispatch should keep ready in the field."
            compact
            style={styles.customSection}
          >
          <ECSResultsMetaRow
            chips={[
              { label: `${draftEntries.length} Saved`, selected: draftEntries.length > 0 },
              ...(showAddForm ? [{ label: 'Adding Entry', selected: true }] : []),
              ...(hasUnsavedChanges ? [{ label: 'Unsaved Changes' }] : []),
            ]}
            style={styles.resultsMeta}
          />

          {draftEntries.length === 0 ? (
            <ECSResultsEmptyState
              style={[styles.emptyState, isContacts && styles.emptyStateDanger]}
              title={config.emptyCopy}
              message={`${config.emptyAction} to keep this reference ready in Dispatch.`}
              actionLabel={!showAddForm ? config.emptyAction : undefined}
              onAction={!showAddForm ? () => setShowAddForm(true) : undefined}
              icon="albums-outline"
              variant={isContacts ? 'warning' : 'compact'}
            />
          ) : (
            draftEntries.map((entry) => (
              <View
                key={entry.id}
                style={[
                  styles.draftCard,
                  isContacts && styles.draftCardDanger,
                ]}
              >
                <View style={styles.draftHeader}>
                  <Text style={styles.draftTitle}>CUSTOM ENTRY</Text>
                  <ECSIconButton
                    icon="trash-outline"
                    variant="destructive"
                    size="compact"
                    onPress={() => handleDelete(entry.id)}
                    accessibilityLabel={`Delete ${config.singularLabel.toLowerCase()}`}
                  />
                </View>

                <ECSInput
                  label={config.labelFieldName}
                  value={entry.label}
                  onChangeText={(value) => updateDraftEntry(entry.id, 'label', value)}
                  placeholder={config.labelPlaceholder}
                  inputProps={{ returnKeyType: 'next' }}
                />

                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>{config.detailFieldName}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={config.detailPlaceholder}
                    placeholderTextColor="rgba(138,138,133,0.5)"
                    value={entry.detail === '—' ? '' : entry.detail}
                    onChangeText={(value) => updateDraftEntry(entry.id, 'detail', value)}
                    returnKeyType="done"
                    keyboardType={columnType === 'contacts' ? 'phone-pad' : 'default'}
                  />
                </View>
              </View>
            ))
          )}

          {showAddForm ? (
            <View style={[styles.addForm, isContacts && styles.addFormContact]}>
              <Text style={[styles.addFormTitle, { color: accentColor }]}>
                ADD {config.singularLabel}
              </Text>

              <ECSInput
                label={config.labelFieldName}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder={config.labelPlaceholder}
                inputProps={{
                  autoFocus: true,
                  returnKeyType: 'next',
                  onFocus: () => scrollAddFormIntoView(),
                }}
              />

              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{config.detailFieldName}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={config.detailPlaceholder}
                  placeholderTextColor="rgba(138,138,133,0.5)"
                  value={newDetail}
                  onChangeText={setNewDetail}
                  returnKeyType="done"
                  onSubmitEditing={handleAddDraft}
                  onFocus={() => scrollAddFormIntoView()}
                  keyboardType={columnType === 'contacts' ? 'phone-pad' : 'default'}
                />
              </View>

              <ECSActionRow compact style={styles.addFormActions}>
                <ECSButton
                  label="Close"
                  variant="tertiary"
                  size="compact"
                  onPress={() => {
                    setShowAddForm(false);
                    setNewLabel('');
                    setNewDetail('');
                    setValidationError(null);
                  }}
                  grow
                />
                <ECSButton
                  label="Add"
                  icon="add-circle-outline"
                  variant="primary"
                  size="compact"
                  onPress={handleAddDraft}
                  disabled={!newLabel.trim()}
                  grow
                />
              </ECSActionRow>
            </View>
          ) : (
            <ECSButton
              label={config.emptyAction}
              icon="add-circle-outline"
              variant="secondary"
              size="medium"
              onPress={() => {
                setShowAddForm(true);
                setValidationError(null);
                scrollAddFormIntoView();
              }}
              style={styles.addButton}
            />
          )}
          </ECSFormSection>
        </ScrollView>
      </KeyboardAvoidingView>
      <ECSConfirmDialog
        visible={confirmDiscardVisible}
        title="Discard Changes?"
        message="Your comms edits have not been saved yet."
        icon="warning-outline"
        cancelLabel="Keep Editing"
        confirmLabel="Discard"
        destructive
        onCancel={() => setConfirmDiscardVisible(false)}
        onConfirm={closeWithoutSaving}
      />
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  shellBody: {
    flex: 1,
    minHeight: 0,
  },
  panelWrapper: {
    flex: 1,
    minHeight: 0,
  },
  headerStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  headerStatusText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  introCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(196,138,44,0.06)',
    marginBottom: 12,
  },
  introIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  introIconWrapDanger: {
    borderColor: 'rgba(192,57,43,0.24)',
    backgroundColor: 'rgba(192,57,43,0.10)',
  },
  introCopy: {
    flex: 1,
  },
  introTitle: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.amber,
    marginBottom: 4,
  },
  introText: {
    ...ECS_TEXT.dialogBody,
  },
  validationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(192,57,43,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.22)',
    marginBottom: 12,
  },
  validationText: {
    flex: 1,
    ...ECS_TEXT.body,
  },
  savingNotice: {
    marginBottom: 12,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  scrollContentWithAddForm: {
    paddingBottom: 180,
  },
  groupLabel: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.textMuted,
    marginBottom: 8,
  },
  customGroupLabel: {
    marginTop: 18,
  },
  customSection: {
    marginTop: 4,
  },
  resultsMeta: {
    marginBottom: 10,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.16)',
  },
  entryRowContact: {
    borderColor: 'rgba(192,57,43,0.12)',
    backgroundColor: 'rgba(192,57,43,0.04)',
  },
  entryDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TACTICAL.textMuted,
  },
  entryTextBlock: {
    flex: 1,
  },
  entryLabel: {
    ...ECS_TEXT.cardTitle,
    fontSize: 13,
    color: 'rgba(230,230,225,0.72)',
  },
  entryDetail: {
    ...ECS_TEXT.helper,
    marginTop: ECS_TEXT_SPACING.titleToSubtitle - 2,
  },
  entryDetailContact: {
    fontFamily: 'Courier',
    fontWeight: '700',
    color: TACTICAL.danger,
    fontSize: 11,
  },
  lockBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(196,138,44,0.05)',
  },
  emptyStateDanger: {
    borderColor: 'rgba(192,57,43,0.22)',
    backgroundColor: 'rgba(192,57,43,0.05)',
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  emptyCopy: {
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    color: TACTICAL.textMuted,
  },
  draftCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.06)',
    marginBottom: 10,
  },
  draftCardDanger: {
    borderColor: 'rgba(192,57,43,0.24)',
    backgroundColor: 'rgba(192,57,43,0.06)',
  },
  draftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  draftTitle: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.textMuted,
  },
  addButton: {
    marginTop: 8,
  },
  addForm: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(196,138,44,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
    marginBottom: 12,
  },
  addFormContact: {
    backgroundColor: 'rgba(192,57,43,0.06)',
    borderColor: 'rgba(192,57,43,0.22)',
  },
  addFormTitle: {
    ...ECS_TEXT.sectionTitle,
    marginBottom: 12,
  },
  inputRow: {
    marginBottom: 10,
  },
  inputLabel: {
    ...ECS_TEXT.statLabel,
    color: TACTICAL.textMuted,
    marginBottom: 5,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.3)',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.text,
  },
  addFormActions: {
    marginTop: 8,
  },
});
