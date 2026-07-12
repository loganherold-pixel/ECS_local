import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { ECSText } from '../ECSText';
import { ECSBadge } from '../ECSStatus';
import {
  EXPEDITION_TRIP_INTENTS,
  type ExpeditionTripIntent,
  type ExpeditionTripIntentSource,
} from '../../lib/readiness/expeditionReadinessTypes';
import { getTripIntentLabel } from '../../lib/readiness/expeditionReadinessCalibration';
import {
  expeditionReadinessStore,
  useTripIntent,
} from '../../lib/readiness';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import { readinessInnerSurfaceStyle } from './readinessUi';

type TripIntentSelectorProps = {
  value?: ExpeditionTripIntent | null;
  source?: ExpeditionTripIntentSource | null;
  onChange?: (intent: ExpeditionTripIntent) => void;
  title?: string;
  compact?: boolean;
  readonly?: boolean;
  fitAllIntents?: boolean;
  style?: StyleProp<ViewStyle>;
  intentChipStyle?: StyleProp<ViewStyle>;
};

const SELECTABLE_INTENTS = EXPEDITION_TRIP_INTENTS.filter((intent) => intent !== 'unknown');

export function TripIntentSelector({
  value,
  source,
  onChange,
  title = 'Trip Intent',
  compact = false,
  readonly = false,
  fitAllIntents = false,
  style,
  intentChipStyle,
}: TripIntentSelectorProps) {
  const storeIntent = useTripIntent();
  const activeIntent = value ?? storeIntent.intent;
  const activeSource = source ?? storeIntent.source;
  const handleChange = (intent: ExpeditionTripIntent) => {
    if (readonly) return;
    if (onChange) {
      onChange(intent);
      return;
    }
    expeditionReadinessStore.setTripIntent(intent);
  };
  const renderIntent = (intent: ExpeditionTripIntent) => {
    const selected = intent === activeIntent;
    return (
      <Pressable
        key={intent}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => handleChange(intent)}
        style={({ pressed }) => [
          styles.intentChip,
          fitAllIntents && styles.intentChipFitAll,
          selected && styles.intentChipSelected,
          intentChipStyle,
          pressed && styles.intentChipPressed,
        ]}
      >
        <ECSText
          variant="chip"
          style={[
            styles.intentText,
            fitAllIntents && styles.intentTextFitAll,
            selected && styles.intentTextSelected,
          ] as TextStyle[]}
          numberOfLines={fitAllIntents ? 2 : 1}
        >
          {getTripIntentLabel(intent)}
        </ECSText>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, readinessInnerSurfaceStyle, compact && styles.containerCompact, style]}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <ECSText variant="statLabel" style={styles.kicker} numberOfLines={1}>
            {title}
          </ECSText>
          <ECSText variant="helper" style={styles.contextLine} numberOfLines={1}>
            {getTripIntentLabel(activeIntent)}
            {activeSource === 'ecs_inferred' ? ' / ECS-inferred' : activeSource === 'unknown' ? ' / Unknown' : ' / Selected'}
          </ECSText>
        </View>
        <ECSBadge
          label={activeSource === 'selected' ? 'Selected' : activeSource === 'ecs_inferred' ? 'ECS-inferred' : 'Unknown'}
          tone={activeSource === 'selected' ? 'ready' : 'warning'}
          compact
        />
      </View>

      {!readonly ? (
        fitAllIntents ? (
          <View style={[styles.intentRow, styles.intentRowFitAll]}>
            {SELECTABLE_INTENTS.map(renderIntent)}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.intentRow}
          >
            {SELECTABLE_INTENTS.map(renderIntent)}
          </ScrollView>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  containerCompact: {
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  kicker: {
    color: ECS.accent,
    fontSize: 8,
    includeFontPadding: false,
  } as TextStyle,
  contextLine: {
    color: ECS.muted,
    lineHeight: 14,
    includeFontPadding: false,
  } as TextStyle,
  intentRow: {
    gap: 6,
    paddingRight: 2,
  },
  intentRowFitAll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    paddingRight: 0,
  },
  intentChip: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
  },
  intentChipFitAll: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    minHeight: 36,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  intentChipSelected: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.accentSoft,
  },
  intentChipPressed: {
    opacity: 0.78,
  },
  intentText: {
    color: ECS.muted,
    fontSize: 8,
    includeFontPadding: false,
  } as TextStyle,
  intentTextFitAll: {
    flexShrink: 1,
    lineHeight: 11,
    textAlign: 'center',
  } as TextStyle,
  intentTextSelected: {
    color: ECS.accent,
  } as TextStyle,
});

export default TripIntentSelector;
