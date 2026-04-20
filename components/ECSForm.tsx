import React, { useMemo, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Switch,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { ECSBadge, ECSIcon } from './ECSStatus';
import { ECSPanel } from './ECSSurface';
import { ECSCardTitle, ECSHelperText, ECSSectionTitle, ECSStatLabel, ECSStatValue } from './ECSText';
import { ECS_TEXT_SPACING } from '../lib/ecsTypographyTokens';
import { ECS_FORM, formatEmptySettingValue, formatUnitValue, parseNumericInput } from '../lib/ecsFormTokens';
import { TACTICAL } from '../lib/theme';

type FieldVariant = 'default' | 'compact' | 'readOnly' | 'disabled' | 'error' | 'telemetryLinked';

type BaseFieldProps = {
  label: string;
  helper?: string | null;
  error?: string | null;
  required?: boolean;
  variant?: FieldVariant;
  style?: StyleProp<ViewStyle>;
};

type InputBaseProps = BaseFieldProps & {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  telemetryLinked?: boolean;
  onChangeText?: (value: string) => void;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'editable' | 'placeholder'>;
  trailing?: React.ReactNode;
};

type SegmentedOption<T extends string | number> = {
  label: string;
  value: T;
};

function resolveFieldVariant({
  variant = 'default',
  disabled,
  readOnly,
  error,
  telemetryLinked,
}: {
  variant?: FieldVariant;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string | null;
  telemetryLinked?: boolean;
}): FieldVariant {
  if (error) return 'error';
  if (telemetryLinked || variant === 'telemetryLinked') return 'telemetryLinked';
  if (disabled || variant === 'disabled') return 'disabled';
  if (readOnly || variant === 'readOnly') return 'readOnly';
  return variant;
}

function FieldShell({
  label,
  helper,
  error,
  required,
  telemetryLinked,
  variant,
  style,
  badge,
  children,
}: BaseFieldProps & {
  telemetryLinked?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.fieldWrap, variant === 'compact' && styles.fieldWrapCompact, style]}>
      <View style={styles.fieldHeader}>
        <View style={styles.fieldLabelRow}>
          <ECSStatLabel style={styles.fieldLabel}>
            {label}
            {required ? ' *' : ''}
          </ECSStatLabel>
          {telemetryLinked ? (
            <ECSBadge label="Live Data" tone="live" compact />
          ) : null}
          {badge}
        </View>
        {(error || helper) ? (
          <ECSHelperText
            style={[
              styles.fieldHelper,
              !!error && styles.fieldErrorText,
            ]}
          >
            {error || helper}
          </ECSHelperText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function ECSValidationText({
  message,
  style,
}: {
  message: string | null | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  if (!message) return null;
  return (
    <View style={[styles.validationRow, style]}>
      <ECSIcon name="alert-circle-outline" tier="compact" tone="unavailable" />
      <ECSHelperText style={styles.validationText}>{message}</ECSHelperText>
    </View>
  );
}

export function ECSFormSection({
  title,
  helper,
  children,
  compact = false,
  action,
  style,
}: {
  title: string;
  helper?: string | null;
  children: React.ReactNode;
  compact?: boolean;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ECSPanel
      variant={compact ? 'quiet' : 'secondary'}
      style={[styles.sectionPanel, compact && styles.sectionPanelCompact, style]}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <ECSSectionTitle>{title}</ECSSectionTitle>
          {helper ? <ECSHelperText style={styles.sectionHelper}>{helper}</ECSHelperText> : null}
        </View>
        {action ? <View style={styles.sectionAction}>{action}</View> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </ECSPanel>
  );
}

export function ECSInput({
  label,
  helper,
  error,
  required,
  variant = 'default',
  value,
  placeholder,
  disabled,
  readOnly,
  telemetryLinked,
  onChangeText,
  inputProps,
  trailing,
  style,
}: InputBaseProps) {
  const [focused, setFocused] = useState(false);
  const resolvedVariant = resolveFieldVariant({ variant, disabled, readOnly, error, telemetryLinked });
  const editable = !(disabled || readOnly || telemetryLinked) && !!onChangeText;
  const multiline = inputProps?.multiline;

  const fieldStyle = useMemo(() => {
    const compact = resolvedVariant === 'compact';
    return [
      styles.inputShell,
      compact && styles.inputShellCompact,
      multiline && styles.inputShellMultiline,
      resolvedVariant === 'readOnly' && styles.inputShellReadOnly,
      resolvedVariant === 'disabled' && styles.inputShellDisabled,
      resolvedVariant === 'telemetryLinked' && styles.inputShellTelemetry,
      resolvedVariant === 'error' && styles.inputShellError,
      focused && editable && styles.inputShellFocused,
    ];
  }, [editable, focused, multiline, resolvedVariant]);

  return (
    <FieldShell
      label={label}
      helper={helper}
      error={error}
      required={required}
      telemetryLinked={telemetryLinked}
      variant={resolvedVariant}
      style={style}
    >
      <View style={fieldStyle}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={ECS_FORM.text.placeholder}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            multiline && styles.inputMultiline,
            (resolvedVariant === 'disabled' || resolvedVariant === 'readOnly') && styles.inputMuted,
            telemetryLinked && styles.inputTelemetry,
          ]}
          {...inputProps}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    </FieldShell>
  );
}

export function ECSNumberInput({
  onChangeText,
  inputProps,
  ...props
}: Omit<InputBaseProps, 'inputProps'> & { inputProps?: Omit<TextInputProps, 'value' | 'onChangeText'> }) {
  return (
    <ECSInput
      {...props}
      onChangeText={(value) => onChangeText?.(parseNumericInput(value))}
      inputProps={{
        keyboardType: 'numeric',
        inputMode: 'decimal',
        returnKeyType: 'done',
        ...inputProps,
      }}
    />
  );
}

export function ECSUnitInput({
  unit,
  ...props
}: Omit<React.ComponentProps<typeof ECSNumberInput>, 'trailing'> & {
  unit: string;
}) {
  return (
    <ECSNumberInput
      {...props}
      trailing={<ECSStatLabel style={styles.unitText}>{unit}</ECSStatLabel>}
    />
  );
}

export function ECSSettingRow({
  label,
  value,
  helper,
  onPress,
  icon,
  disabled,
  readOnly,
  telemetryLinked,
  style,
}: {
  label: string;
  value?: string | null;
  helper?: string | null;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof ECSIcon>['name'];
  disabled?: boolean;
  readOnly?: boolean;
  telemetryLinked?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const interactive = !!onPress && !disabled;
  const Container = interactive ? TouchableOpacity : View;

  return (
    <Container
      onPress={interactive ? onPress : undefined}
      activeOpacity={interactive ? 0.78 : 1}
      style={[
        styles.settingRow,
        disabled && styles.settingRowDisabled,
        telemetryLinked && styles.settingRowTelemetry,
        style,
      ]}
    >
      <View style={styles.settingCopy}>
        <View style={styles.settingTitleRow}>
          {icon ? <ECSIcon name={icon} tier="compact" tone="info" /> : null}
          <ECSStatLabel style={styles.settingLabel}>{label}</ECSStatLabel>
          {telemetryLinked ? <ECSBadge label="Live Data" tone="live" compact /> : null}
          {readOnly ? <ECSBadge label="Read Only" tone="info" compact /> : null}
        </View>
        {helper ? <ECSHelperText style={styles.settingHelper}>{helper}</ECSHelperText> : null}
      </View>
      <View style={styles.settingValueWrap}>
        <ECSStatValue
          numberOfLines={2}
          style={[styles.settingValue, disabled && styles.settingValueDisabled]}
        >
          {formatEmptySettingValue(value)}
        </ECSStatValue>
        {interactive ? (
          <ECSIcon name="chevron-forward" tier="compact" tone={disabled ? 'info' : 'selected'} />
        ) : null}
      </View>
    </Container>
  );
}

export function ECSSelectRow({
  label,
  value,
  helper,
  onPress,
  disabled,
  readOnly,
  style,
}: {
  label: string;
  value?: string | null;
  helper?: string | null;
  onPress?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ECSSettingRow
      label={label}
      value={value}
      helper={helper}
      onPress={onPress}
      disabled={disabled}
      readOnly={readOnly}
      icon="chevron-expand-outline"
      style={style}
    />
  );
}

export function ECSToggleRow({
  label,
  value,
  onValueChange,
  helper,
  disabled,
  telemetryLinked,
  style,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  helper?: string | null;
  disabled?: boolean;
  telemetryLinked?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const handlePress = () => {
    if (disabled || telemetryLinked) return;
    onValueChange(!value);
  };

  return (
    <TouchableOpacity
      style={[
        styles.settingRow,
        disabled && styles.settingRowDisabled,
        telemetryLinked && styles.settingRowTelemetry,
        style,
      ]}
      activeOpacity={disabled ? 1 : 0.82}
      onPress={handlePress}
      disabled={disabled}
    >
      <View style={styles.settingCopy}>
        <View style={styles.settingTitleRow}>
          <ECSStatLabel style={styles.settingLabel}>{label}</ECSStatLabel>
          {telemetryLinked ? <ECSBadge label="Live Data" tone="live" compact /> : null}
        </View>
        {helper ? <ECSHelperText style={styles.settingHelper}>{helper}</ECSHelperText> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled || telemetryLinked}
        trackColor={{
          false: 'rgba(255,255,255,0.14)',
          true: 'rgba(196,138,44,0.52)',
        }}
        thumbColor={value ? TACTICAL.amber : '#BCC3CA'}
        ios_backgroundColor="rgba(255,255,255,0.14)"
      />
    </TouchableOpacity>
  );
}

export function ECSSegmentedField<T extends string | number>({
  label,
  helper,
  value,
  options,
  onChange,
  compact = false,
  style,
}: {
  label: string;
  helper?: string | null;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (next: T) => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <FieldShell label={label} helper={helper} variant={compact ? 'compact' : 'default'} style={style}>
      <View style={[styles.segmentedWrap, compact && styles.segmentedWrapCompact]}>
        {options.map((option) => (
          <TouchableOpacity
            key={String(option.value)}
            style={[
              styles.segmentButton,
              compact && styles.segmentButtonCompact,
              option.value === value && styles.segmentButtonActive,
            ]}
            activeOpacity={0.8}
            onPress={() => onChange(option.value)}
          >
            <ECSStatValue
              style={[
                styles.segmentText,
                option.value === value && styles.segmentTextActive,
              ]}
            >
              {option.label}
            </ECSStatValue>
          </TouchableOpacity>
        ))}
      </View>
    </FieldShell>
  );
}

export function ECSSliderField({
  label,
  helper,
  valueLabel,
  children,
  style,
}: {
  label: string;
  helper?: string | null;
  valueLabel?: string | null;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <FieldShell
      label={label}
      helper={helper}
      badge={valueLabel ? <ECSBadge label={valueLabel} tone="selected" compact /> : undefined}
      style={style}
    >
      <View style={styles.sliderFieldShell}>{children}</View>
    </FieldShell>
  );
}

export function ECSFormSummary({
  title,
  rows,
  style,
}: {
  title: string;
  rows: { label: string; value: string; accent?: string }[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ECSPanel variant="quiet" style={[styles.summaryPanel, style]}>
      <ECSCardTitle style={styles.summaryTitle}>{title}</ECSCardTitle>
      <View style={styles.summaryRows}>
        {rows.map((row, index) => (
          <View
            key={`${row.label}-${index}`}
            style={[styles.summaryRow, index > 0 && styles.summaryRowWithDivider]}
          >
            <ECSStatLabel>{row.label}</ECSStatLabel>
            <ECSStatValue style={row.accent ? { color: row.accent } : undefined}>
              {row.value}
            </ECSStatValue>
          </View>
        ))}
      </View>
    </ECSPanel>
  );
}

export function ECSUnitSummary({
  label,
  value,
  unit,
  fallback,
}: {
  label: string;
  value: string | number | null | undefined;
  unit: string;
  fallback?: string;
}) {
  return (
    <ECSSettingRow
      label={label}
      value={formatUnitValue(value, unit, fallback)}
      readOnly
    />
  );
}

const styles = StyleSheet.create({
  sectionPanel: {
    marginBottom: 12,
    padding: ECS_FORM.padding.sectionX,
  },
  sectionPanelCompact: {
    paddingVertical: ECS_FORM.padding.compactFieldY,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  sectionCopy: {
    flex: 1,
    gap: ECS_TEXT_SPACING.titleToSubtitle - 2,
  },
  sectionHelper: {
    lineHeight: 16,
  },
  sectionAction: {
    alignItems: 'flex-end',
  },
  sectionBody: {
    gap: 12,
  },
  fieldWrap: {
    width: '100%',
    gap: 8,
  },
  fieldWrapCompact: {
    gap: 6,
  },
  fieldHeader: {
    gap: 4,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  fieldLabel: {
    color: ECS_FORM.text.label,
  },
  fieldHelper: {
    lineHeight: 15,
  },
  fieldErrorText: {
    color: ECS_FORM.text.error,
  },
  inputShell: {
    minHeight: ECS_FORM.height.input,
    borderRadius: ECS_FORM.radius.field,
    borderWidth: 1,
    borderColor: ECS_FORM.border.default,
    backgroundColor: ECS_FORM.background.field,
    paddingHorizontal: ECS_FORM.padding.fieldX,
    paddingVertical: ECS_FORM.padding.fieldY,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_FORM.padding.inlineGap,
  },
  inputShellCompact: {
    minHeight: ECS_FORM.height.compactInput,
    paddingHorizontal: ECS_FORM.padding.compactFieldX,
    paddingVertical: ECS_FORM.padding.compactFieldY,
    borderRadius: ECS_FORM.radius.compactField,
  },
  inputShellMultiline: {
    alignItems: 'flex-start',
  },
  inputShellFocused: {
    borderColor: ECS_FORM.border.focus,
    backgroundColor: ECS_FORM.background.fieldMuted,
  },
  inputShellReadOnly: {
    backgroundColor: ECS_FORM.background.fieldMuted,
    borderColor: ECS_FORM.border.default,
  },
  inputShellDisabled: {
    backgroundColor: ECS_FORM.background.disabled,
    borderColor: ECS_FORM.border.disabled,
  },
  inputShellError: {
    backgroundColor: ECS_FORM.background.error,
    borderColor: ECS_FORM.border.error,
  },
  inputShellTelemetry: {
    backgroundColor: ECS_FORM.background.telemetry,
    borderColor: ECS_FORM.border.telemetry,
  },
  input: {
    flex: 1,
    color: ECS_FORM.text.value,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 0,
    minHeight: 20,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  inputMuted: {
    color: ECS_FORM.text.disabled,
  },
  inputTelemetry: {
    color: ECS_FORM.text.telemetry,
  },
  trailing: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  unitText: {
    color: ECS_FORM.text.unit,
  },
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  validationText: {
    flex: 1,
    color: ECS_FORM.text.error,
  },
  settingRow: {
    minHeight: ECS_FORM.height.settingRow,
    borderRadius: ECS_FORM.radius.row,
    borderWidth: 1,
    borderColor: ECS_FORM.border.default,
    backgroundColor: ECS_FORM.background.field,
    paddingHorizontal: ECS_FORM.padding.fieldX,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingRowDisabled: {
    borderColor: ECS_FORM.border.disabled,
    backgroundColor: ECS_FORM.background.disabled,
  },
  settingRowTelemetry: {
    borderColor: ECS_FORM.border.telemetry,
    backgroundColor: ECS_FORM.background.telemetry,
  },
  settingCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  settingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    minWidth: 0,
  },
  settingLabel: {
    flexShrink: 1,
    color: ECS_FORM.text.label,
  },
  settingHelper: {
    lineHeight: 14,
  },
  settingValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '44%',
  },
  settingValue: {
    textAlign: 'right',
  },
  settingValueDisabled: {
    color: ECS_FORM.text.disabled,
  },
  segmentedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentedWrapCompact: {
    gap: 6,
  },
  segmentButton: {
    flexGrow: 1,
    minWidth: '22%',
    minHeight: ECS_FORM.height.segmented,
    borderRadius: ECS_FORM.radius.segmented,
    borderWidth: 1,
    borderColor: ECS_FORM.border.default,
    backgroundColor: ECS_FORM.background.field,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  segmentButtonCompact: {
    minWidth: '18%',
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  segmentButtonActive: {
    borderColor: ECS_FORM.border.focus,
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  segmentText: {
    color: ECS_FORM.text.label,
    fontSize: 12,
  },
  segmentTextActive: {
    color: TACTICAL.amber,
  },
  sliderFieldShell: {
    borderRadius: ECS_FORM.radius.field,
    borderWidth: 1,
    borderColor: ECS_FORM.border.default,
    backgroundColor: ECS_FORM.background.fieldMuted,
    paddingHorizontal: ECS_FORM.padding.fieldX,
    paddingVertical: ECS_FORM.padding.fieldY,
    gap: 10,
  },
  summaryPanel: {
    gap: 10,
  },
  summaryTitle: {
    marginBottom: 2,
  },
  summaryRows: {
    gap: 0,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 7,
  },
  summaryRowWithDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
});
