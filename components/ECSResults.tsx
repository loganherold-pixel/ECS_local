import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { SafeIcon as Ionicons } from './SafeIcon';
import { ECSChip } from './ECSChip';
import { ECSPanel } from './ECSSurface';
import { ECSStateMessage } from './ECSStateMessage';
import { ECS_TEXT } from '../lib/ecsTypographyTokens';
import { TACTICAL } from '../lib/theme';

type MetaChip = {
  label: string;
  selected?: boolean;
};

type FilterChip = {
  label: string;
  selected?: boolean;
};

interface ECSSearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  onClear?: () => void;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'placeholder' | 'editable'>;
}

interface ECSResultsMetaRowProps {
  chips: MetaChip[];
  style?: StyleProp<ViewStyle>;
}

interface ECSActiveFilterSummaryProps {
  summary: string;
  filters?: FilterChip[];
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

interface ECSResultsEmptyStateProps {
  title: string;
  message: string;
  helper?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  variant?: 'standard' | 'selection_required' | 'partial_data' | 'warning' | 'compact';
  style?: StyleProp<ViewStyle>;
}

export function ECSSearchField({
  value,
  onChangeText,
  placeholder,
  disabled = false,
  loading = false,
  onClear,
  trailing,
  style,
  inputProps,
}: ECSSearchFieldProps) {
  const showClear = !!onClear && value.trim().length > 0 && !loading;

  return (
    <View
      style={[
        styles.searchShell,
        disabled && styles.searchShellDisabled,
        style,
      ]}
    >
      <Ionicons
        name="search"
        size={15}
        color={disabled ? TACTICAL.textMuted : TACTICAL.amber}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TACTICAL.textMuted}
        editable={!disabled}
        style={[styles.searchInput, disabled && styles.searchInputDisabled]}
        {...inputProps}
      />

      {loading ? <ActivityIndicator size="small" color={TACTICAL.amber} /> : null}

      {!loading && showClear ? (
        <TouchableOpacity
          onPress={onClear}
          activeOpacity={0.78}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.searchAction}
        >
          <Ionicons name="close-circle" size={16} color={TACTICAL.textMuted} />
        </TouchableOpacity>
      ) : null}

      {!loading && !showClear ? trailing : null}
    </View>
  );
}

export function ECSResultsMetaRow({ chips, style }: ECSResultsMetaRowProps) {
  const visibleChips = chips.filter((chip) => chip.label.trim().length > 0);
  if (visibleChips.length === 0) return null;

  return (
    <View style={[styles.metaRow, style]}>
      {visibleChips.map((chip) => (
        <ECSChip
          key={chip.label}
          label={chip.label}
          selected={chip.selected}
          compact
        />
      ))}
    </View>
  );
}

export function ECSActiveFilterSummary({
  summary,
  filters = [],
  actionLabel,
  onAction,
  style,
}: ECSActiveFilterSummaryProps) {
  const visibleFilters = filters.filter((filter) => filter.label.trim().length > 0);

  return (
    <ECSPanel variant="quiet" style={[styles.summaryPanel, style]}>
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryText}>{summary}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            activeOpacity={0.78}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.summaryAction}
          >
            <Text style={styles.summaryActionText}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {visibleFilters.length > 0 ? (
        <View style={styles.filterRow}>
          {visibleFilters.map((filter) => (
            <ECSChip
              key={filter.label}
              label={filter.label}
              selected={filter.selected}
              compact
            />
          ))}
        </View>
      ) : null}
    </ECSPanel>
  );
}

export function ECSResultsEmptyState({
  title,
  message,
  helper,
  actionLabel,
  onAction,
  icon = 'search-outline',
  variant = 'compact',
  style,
}: ECSResultsEmptyStateProps) {
  return (
    <ECSPanel variant="quiet" style={[styles.emptyPanel, style]}>
      <ECSStateMessage
        title={title}
        message={message}
        helper={helper}
        actionLabel={actionLabel}
        onAction={onAction}
        icon={icon}
        variant={variant}
      />
    </ECSPanel>
  );
}

const styles = StyleSheet.create({
  searchShell: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.20)',
    backgroundColor: 'rgba(9,12,14,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  searchShellDisabled: {
    borderColor: 'rgba(62,79,60,0.18)',
    backgroundColor: 'rgba(9,12,14,0.84)',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    ...ECS_TEXT.body,
    paddingVertical: 0,
  },
  searchInputDisabled: {
    color: TACTICAL.textMuted,
  },
  searchAction: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  summaryPanel: {
    gap: 10,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryText: {
    flex: 1,
    ...ECS_TEXT.helper,
    lineHeight: 17,
  },
  summaryAction: {
    alignSelf: 'center',
  },
  summaryActionText: {
    ...ECS_TEXT.button,
    color: TACTICAL.amber,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  emptyPanel: {
    padding: 0,
  },
});
