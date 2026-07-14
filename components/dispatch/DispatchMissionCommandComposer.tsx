import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  MISSION_COMMAND_COMPOSER_TYPES,
  updateMissionCommandComposerType,
  type MissionCommandComposerAcknowledgmentMode,
  type MissionCommandComposerAssignmentKind,
  type MissionCommandComposerCatalog,
  type MissionCommandComposerDeadlineMode,
  type MissionCommandComposerForm,
  type MissionCommandComposerMode,
  type MissionCommandComposerTargetKind,
  type MissionCommandComposerType,
} from '../../lib/dispatchMissionCommandComposer';
import { ECS, TACTICAL } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';

interface DispatchMissionCommandComposerProps {
  visible: boolean;
  mode: MissionCommandComposerMode;
  commandTitle?: string | null;
  form: MissionCommandComposerForm;
  catalog: MissionCommandComposerCatalog;
  soloMode: boolean;
  canAssign: boolean;
  error: string | null;
  submitting: boolean;
  onChange: (form: MissionCommandComposerForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}

const TYPE_LABELS: Record<MissionCommandComposerType, string> = {
  check_in: 'Check-In',
  rally: 'Rally',
  assist: 'Assist',
  hazard: 'Hazard',
  resource: 'Resource',
  route: 'Route',
  recovery: 'Recovery',
  general: 'General',
};

const TARGET_LABELS: Record<MissionCommandComposerTargetKind, string> = {
  member: 'Member',
  role: 'Role',
  selected_members: 'Selected',
  expedition: 'Expedition',
  vehicle: 'Vehicle',
  self: 'Self',
};

const ASSIGNMENT_LABELS: Record<MissionCommandComposerAssignmentKind, string> = {
  unassigned: 'Unassigned',
  member: 'Member',
  role: 'Role',
  vehicle: 'Vehicle',
  team_unit: 'Team Unit',
};

const ACK_LABELS: Record<MissionCommandComposerAcknowledgmentMode, string> = {
  none: 'Not Required',
  any: 'Any One',
  all: 'All Targets',
  role: 'Role Required',
  count: 'Exact Count',
};

const DEADLINE_LABELS: Record<MissionCommandComposerDeadlineMode, string> = {
  none: 'No Deadline',
  absolute: 'Absolute',
  relative: 'Relative',
  mission_clock: 'Mission Clock',
  milestone: 'Milestone',
};

const PRIORITY_OPTIONS = [
  { id: 'low', label: 'Low' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
  { id: 'critical', label: 'Critical' },
] as const;

function DispatchMissionCommandComposer({
  visible,
  mode,
  commandTitle,
  form,
  catalog,
  soloMode,
  canAssign,
  error,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: DispatchMissionCommandComposerProps) {
  const title = mode === 'create'
    ? 'Create Mission Command'
    : mode === 'reassign'
      ? 'Reassign Command'
      : 'Request Follow-Up';
  const submitLabel = mode === 'create'
    ? 'Create Command'
    : mode === 'reassign'
      ? 'Save Assignment'
      : 'Request Follow-Up';
  const targetKinds = useMemo(() => {
    if (soloMode) return ['self'] as MissionCommandComposerTargetKind[];
    const kinds: MissionCommandComposerTargetKind[] = [];
    if (catalog.members.length > 0) kinds.push('member', 'selected_members', 'expedition');
    if (catalog.roles.length > 0) kinds.push('role');
    if (catalog.vehicles.length > 0) kinds.push('vehicle');
    return kinds;
  }, [catalog.members.length, catalog.roles.length, catalog.vehicles.length, soloMode]);
  const assignmentKinds = useMemo(() => {
    const kinds: MissionCommandComposerAssignmentKind[] = ['unassigned'];
    if (!canAssign) return kinds;
    if (catalog.members.length > 0) kinds.push('member');
    if (catalog.roles.length > 0) kinds.push('role');
    if (catalog.vehicles.length > 0) kinds.push('vehicle');
    if (catalog.teamUnits.length > 0) kinds.push('team_unit');
    return kinds;
  }, [canAssign, catalog.members.length, catalog.roles.length, catalog.teamUnits.length, catalog.vehicles.length]);
  const update = <Key extends keyof MissionCommandComposerForm>(
    key: Key,
    value: MissionCommandComposerForm[Key],
  ) => onChange({ ...form, [key]: value });

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title={title}
      eyebrow="MISSION COMMAND"
      subtitle={commandTitle ?? (mode === 'create' ? 'Structured ECS team coordination' : undefined)}
      icon={mode === 'create' ? 'add-circle-outline' : mode === 'reassign' ? 'people-outline' : 'return-up-forward-outline'}
      overlayClass="editor"
      stackBehavior="allow-stack"
      maxWidth={860}
      maxHeightFraction={0.92}
      scrollable
      keyboardAware
      closeGuardKey={submitting}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Cancel"
            variant="tertiary"
            size="medium"
            disabled={submitting}
            onPress={onClose}
          />
          <ECSButton
            label={submitLabel}
            icon={mode === 'create' ? 'send-outline' : mode === 'reassign' ? 'people-outline' : 'return-up-forward-outline'}
            variant="primary"
            size="medium"
            grow
            loading={submitting}
            disabled={submitting}
            onPress={onSubmit}
          />
        </ECSOverlayFooter>
      )}
    >
      <View style={styles.content} testID="dispatch-mission-command-composer">
        {mode === 'create' ? (
          <>
            <ComposerSection label="Command Type" icon="apps-outline">
              <OptionGrid
                options={MISSION_COMMAND_COMPOSER_TYPES.map((id) => ({ id, label: TYPE_LABELS[id] }))}
                selectedId={form.type}
                onSelect={(type) => onChange(updateMissionCommandComposerType(form, type as MissionCommandComposerType))}
                testIDPrefix="mission-command-type"
              />
            </ComposerSection>

            <ComposerSection label="Command" icon="document-text-outline">
              <FieldLabel label="Title" />
              <TextInput
                value={form.title}
                onChangeText={(value) => update('title', value)}
                placeholder="Command title"
                placeholderTextColor={TACTICAL.textMuted}
                maxLength={180}
                style={styles.input}
                accessibilityLabel="Mission Command title"
                testID="mission-command-title-input"
              />
              <FieldLabel label="Instructions" />
              <TextInput
                value={form.instructions}
                onChangeText={(value) => update('instructions', value)}
                placeholder="Operational instructions"
                placeholderTextColor={TACTICAL.textMuted}
                maxLength={2_000}
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.messageInput]}
                accessibilityLabel="Mission Command instructions"
                testID="mission-command-instructions-input"
              />
              <FieldLabel label="Priority" />
              <OptionGrid
                options={PRIORITY_OPTIONS.map((option) => ({ ...option }))}
                selectedId={form.priority}
                onSelect={(priority) => update('priority', priority as MissionCommandComposerForm['priority'])}
                testIDPrefix="mission-command-priority"
              />
            </ComposerSection>

            <ComposerSection label="Target" icon="locate-outline">
              <OptionGrid
                options={targetKinds.map((id) => ({ id, label: TARGET_LABELS[id] }))}
                selectedId={form.targetKind}
                onSelect={(targetKind) => update('targetKind', targetKind as MissionCommandComposerTargetKind)}
                testIDPrefix="mission-command-target-kind"
              />
              <TargetSelector form={form} catalog={catalog} onChange={onChange} />
            </ComposerSection>
          </>
        ) : null}

        {mode !== 'follow_up' ? (
          <ComposerSection label="Assignment" icon="person-add-outline">
            <OptionGrid
              options={assignmentKinds.map((id) => ({ id, label: ASSIGNMENT_LABELS[id] }))}
              selectedId={form.assignmentKind}
              onSelect={(assignmentKind) => update('assignmentKind', assignmentKind as MissionCommandComposerAssignmentKind)}
              testIDPrefix="mission-command-assignment-kind"
            />
            <AssignmentSelector form={form} catalog={catalog} onChange={onChange} />
            {!canAssign && mode === 'create' ? (
              <Text style={styles.muted}>Assignment requires expedition lead or Dispatch admin permission.</Text>
            ) : null}
          </ComposerSection>
        ) : null}

        {mode === 'create' ? (
          <>
            <ComposerSection label="Acknowledgment" icon="checkmark-done-outline">
              <OptionGrid
                options={(Object.keys(ACK_LABELS) as MissionCommandComposerAcknowledgmentMode[])
                  .map((id) => ({ id, label: ACK_LABELS[id] }))}
                selectedId={form.acknowledgmentMode}
                onSelect={(acknowledgmentMode) => update(
                  'acknowledgmentMode',
                  acknowledgmentMode as MissionCommandComposerAcknowledgmentMode,
                )}
                testIDPrefix="mission-command-ack"
              />
              {form.acknowledgmentMode === 'role' ? (
                <EntityOptions
                  options={catalog.roles}
                  selectedIds={[form.acknowledgmentRoleId]}
                  onToggle={(id) => update('acknowledgmentRoleId', id)}
                  testIDPrefix="mission-command-ack-role"
                />
              ) : null}
              {form.acknowledgmentMode === 'count' ? (
                <LabeledInput
                  label="Required responses"
                  value={form.acknowledgmentCount}
                  onChangeText={(value) => update('acknowledgmentCount', value.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  testID="mission-command-ack-count"
                />
              ) : null}
            </ComposerSection>

            <ComposerSection label="Mission Clock" icon="timer-outline">
              <OptionGrid
                options={(Object.keys(DEADLINE_LABELS) as MissionCommandComposerDeadlineMode[])
                  .filter((id) => id !== 'milestone' || catalog.milestones.length > 0)
                  .map((id) => ({ id, label: DEADLINE_LABELS[id] }))}
                selectedId={form.deadlineMode}
                onSelect={(deadlineMode) => update('deadlineMode', deadlineMode as MissionCommandComposerDeadlineMode)}
                testIDPrefix="mission-command-deadline"
              />
              <DeadlineSelector form={form} catalog={catalog} onChange={onChange} />
            </ComposerSection>

            <ComposerSection label="Linked Context" icon="map-outline">
              <EntityOptions
                options={[
                  { id: '', label: 'None' },
                  ...catalog.linkedContexts.map((option) => ({ id: option.id, label: option.label })),
                  { id: 'manual', label: 'Manual Note' },
                ]}
                selectedIds={[form.linkedContextId]}
                onToggle={(id) => update('linkedContextId', id)}
                testIDPrefix="mission-command-context"
              />
              {form.linkedContextId === 'manual' ? (
                <LabeledInput
                  label="Context label"
                  value={form.manualContextLabel}
                  onChangeText={(value) => update('manualContextLabel', value)}
                  testID="mission-command-manual-context"
                />
              ) : null}
            </ComposerSection>
          </>
        ) : null}

        {mode === 'follow_up' ? (
          <ComposerSection label="Follow-Up" icon="return-up-forward-outline">
            <FieldLabel label="Instructions" />
            <TextInput
              value={form.instructions}
              onChangeText={(value) => update('instructions', value)}
              placeholder="Requested update or next check"
              placeholderTextColor={TACTICAL.textMuted}
              maxLength={500}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.messageInput]}
              accessibilityLabel="Follow-up instructions"
              testID="mission-command-follow-up-input"
            />
          </ComposerSection>
        ) : null}

        {error ? (
          <View style={styles.error} accessibilityRole="alert" testID="mission-command-composer-error">
            <Ionicons name="warning-outline" size={15} color={TACTICAL.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.safetyNotice} accessibilityRole="summary">
          <Ionicons name="shield-checkmark-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.safetyText}>
            ECS team coordination only. This does not contact emergency services or transmit outside approved Dispatch channels.
          </Text>
        </View>
      </View>
    </ECSModalShell>
  );
}

export default React.memo(DispatchMissionCommandComposer);

function ComposerSection({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section} accessibilityLabel={label}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={14} color={TACTICAL.amber} />
        <Text style={styles.sectionLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function OptionGrid({
  options,
  selectedId,
  onSelect,
  testIDPrefix,
}: {
  options: { id: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={styles.optionGrid} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <TouchableOpacity
            key={option.id || 'none'}
            testID={`${testIDPrefix}-${option.id || 'none'}`}
            style={[styles.option, selected ? styles.optionSelected : null]}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            activeOpacity={0.78}
            onPress={() => onSelect(option.id)}
          >
            <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]} numberOfLines={2}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function EntityOptions({
  options,
  selectedIds,
  onToggle,
  multiple = false,
  testIDPrefix,
}: {
  options: { id: string; label: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  multiple?: boolean;
  testIDPrefix: string;
}) {
  if (options.length === 0) return <Text style={styles.muted}>No eligible options available.</Text>;
  return (
    <View style={styles.entityList}>
      {options.map((option) => {
        const selected = selectedIds.includes(option.id);
        return (
          <TouchableOpacity
            key={option.id || 'none'}
            testID={`${testIDPrefix}-${option.id || 'none'}`}
            style={[styles.entityOption, selected ? styles.entityOptionSelected : null]}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityLabel={option.label}
            accessibilityState={multiple ? { checked: selected } : { selected }}
            activeOpacity={0.78}
            onPress={() => onToggle(option.id)}
          >
            <Ionicons
              name={multiple
                ? selected ? 'checkbox-outline' : 'square-outline'
                : selected ? 'radio-button-on-outline' : 'radio-button-off-outline'}
              size={15}
              color={selected ? TACTICAL.amber : TACTICAL.textMuted}
            />
            <Text style={[styles.entityText, selected ? styles.entityTextSelected : null]} numberOfLines={2}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TargetSelector({
  form,
  catalog,
  onChange,
}: {
  form: MissionCommandComposerForm;
  catalog: MissionCommandComposerCatalog;
  onChange: (form: MissionCommandComposerForm) => void;
}) {
  if (form.targetKind === 'self' || form.targetKind === 'expedition') return null;
  if (form.targetKind === 'member') {
    return (
      <EntityOptions
        options={catalog.members}
        selectedIds={[form.targetMemberId]}
        onToggle={(targetMemberId) => onChange({ ...form, targetMemberId })}
        testIDPrefix="mission-command-target-member"
      />
    );
  }
  if (form.targetKind === 'selected_members') {
    return (
      <EntityOptions
        options={catalog.members}
        selectedIds={form.selectedMemberIds}
        multiple
        onToggle={(id) => onChange({
          ...form,
          selectedMemberIds: form.selectedMemberIds.includes(id)
            ? form.selectedMemberIds.filter((memberId) => memberId !== id)
            : [...form.selectedMemberIds, id],
        })}
        testIDPrefix="mission-command-target-selected"
      />
    );
  }
  if (form.targetKind === 'role') {
    return (
      <EntityOptions
        options={catalog.roles}
        selectedIds={[form.targetRoleId]}
        onToggle={(targetRoleId) => onChange({ ...form, targetRoleId })}
        testIDPrefix="mission-command-target-role"
      />
    );
  }
  return (
    <EntityOptions
      options={catalog.vehicles}
      selectedIds={[form.targetVehicleId]}
      onToggle={(targetVehicleId) => onChange({ ...form, targetVehicleId })}
      testIDPrefix="mission-command-target-vehicle"
    />
  );
}

function AssignmentSelector({
  form,
  catalog,
  onChange,
}: {
  form: MissionCommandComposerForm;
  catalog: MissionCommandComposerCatalog;
  onChange: (form: MissionCommandComposerForm) => void;
}) {
  if (form.assignmentKind === 'unassigned') return null;
  const config = form.assignmentKind === 'member'
    ? { options: catalog.members, key: 'assignmentMemberId' as const }
    : form.assignmentKind === 'role'
      ? { options: catalog.roles, key: 'assignmentRoleId' as const }
      : form.assignmentKind === 'vehicle'
        ? { options: catalog.vehicles, key: 'assignmentVehicleId' as const }
        : { options: catalog.teamUnits, key: 'assignmentTeamUnitId' as const };
  return (
    <EntityOptions
      options={config.options}
      selectedIds={[form[config.key]]}
      onToggle={(id) => onChange({ ...form, [config.key]: id })}
      testIDPrefix={`mission-command-${config.key}`}
    />
  );
}

function DeadlineSelector({
  form,
  catalog,
  onChange,
}: {
  form: MissionCommandComposerForm;
  catalog: MissionCommandComposerCatalog;
  onChange: (form: MissionCommandComposerForm) => void;
}) {
  if (form.deadlineMode === 'none') return null;
  if (form.deadlineMode === 'absolute') {
    return (
      <LabeledInput
        label="Deadline time"
        value={form.absoluteDeadlineAt}
        onChangeText={(absoluteDeadlineAt) => onChange({ ...form, absoluteDeadlineAt })}
        placeholder="2026-07-14T18:30:00"
        testID="mission-command-absolute-deadline"
      />
    );
  }
  if (form.deadlineMode === 'relative') {
    return (
      <LabeledInput
        label="Minutes from now"
        value={form.relativeDeadlineMinutes}
        onChangeText={(value) => onChange({ ...form, relativeDeadlineMinutes: value.replace(/[^0-9]/g, '') })}
        keyboardType="number-pad"
        testID="mission-command-relative-deadline"
      />
    );
  }
  if (form.deadlineMode === 'mission_clock') {
    return (
      <OptionGrid
        options={[
          { id: '15', label: '15 Min' },
          { id: '30', label: '30 Min' },
          { id: '60', label: '1 Hour' },
          { id: '120', label: '2 Hours' },
        ]}
        selectedId={form.missionClockMinutes}
        onSelect={(missionClockMinutes) => onChange({ ...form, missionClockMinutes })}
        testIDPrefix="mission-command-clock-template"
      />
    );
  }
  return (
    <EntityOptions
      options={catalog.milestones}
      selectedIds={[form.milestoneId]}
      onToggle={(milestoneId) => onChange({ ...form, milestoneId })}
      testIDPrefix="mission-command-milestone"
    />
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  testID: string;
}) {
  return (
    <View style={styles.labeledInput}>
      <FieldLabel label={label} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TACTICAL.textMuted}
        keyboardType={keyboardType}
        style={styles.input}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 6,
  },
  section: {
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  sectionHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionLabel: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  fieldLabel: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 6,
    backgroundColor: ECS_SURFACE.background.compact,
    color: TACTICAL.text,
    fontSize: 12,
  },
  messageInput: {
    minHeight: 92,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  option: {
    minHeight: 44,
    minWidth: 78,
    flexGrow: 1,
    flexBasis: 92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 6,
    backgroundColor: ECS_SURFACE.background.quiet,
  },
  optionSelected: {
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  optionText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  optionTextSelected: {
    color: TACTICAL.text,
  },
  entityList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  entityOption: {
    minHeight: 44,
    minWidth: 132,
    flexGrow: 1,
    flexBasis: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 6,
    backgroundColor: ECS_SURFACE.background.quiet,
  },
  entityOptionSelected: {
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  entityText: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
  },
  entityTextSelected: {
    color: TACTICAL.text,
  },
  muted: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
  },
  labeledInput: {
    gap: 5,
  },
  error: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: `${TACTICAL.danger}88`,
    borderRadius: 6,
    backgroundColor: `${TACTICAL.danger}12`,
  },
  errorText: {
    flex: 1,
    color: TACTICAL.danger,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  safetyNotice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.warning,
    borderRadius: 6,
    backgroundColor: ECS_SURFACE.background.warning,
  },
  safetyText: {
    flex: 1,
    color: ECS.muted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
});
