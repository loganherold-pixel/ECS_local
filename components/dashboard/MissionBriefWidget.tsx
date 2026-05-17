import React from 'react';
import { View, StyleSheet } from 'react-native';
import MissionBriefCard from './MissionBriefCard';
import MissionBriefCadLog from './MissionBriefCadLog';
import type { MissionBrief } from '../../lib/missionBriefEngine';

type Props = {
  brief: MissionBrief | null;
  compact?: boolean;
};

export default function MissionBriefWidget({ brief, compact = true }: Props) {
  return (
    <View style={styles.container}>
      <MissionBriefCard brief={brief} compact={compact} />
      {compact ? null : <MissionBriefCadLog />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    gap: 12,
  },
});
