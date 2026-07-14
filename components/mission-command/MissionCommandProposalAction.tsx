import React, { useCallback, useMemo, useRef, useState } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';

import { ECSButton } from '../ECSButton';
import { useApp } from '../../context/AppContext';
import {
  missionCommandProposalHandoffAdapter,
  type MissionCommandProposalBuildResult,
} from '../../lib/dispatchMissionCommandProposal';
import {
  isDispatchFeatureEnabled,
  resolveDispatchRolloutConfig,
  type DispatchRolloutFeature,
} from '../../lib/dispatchRolloutConfig';

export type MissionCommandProposalActionProps = {
  buildProposal: () => MissionCommandProposalBuildResult;
  label?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  icon?: React.ComponentProps<typeof ECSButton>['icon'];
  variant?: React.ComponentProps<typeof ECSButton>['variant'];
  size?: React.ComponentProps<typeof ECSButton>['size'];
  style?: StyleProp<ViewStyle>;
  grow?: boolean;
  numberOfLines?: number;
  onStaged?: () => void;
  requiredFeature?: DispatchRolloutFeature;
};

/**
 * Shared explicit-action boundary for source-domain proposals.
 * It stages review context only; Dispatch still requires review and Composer submission.
 */
export default function MissionCommandProposalAction({
  buildProposal,
  label = 'Coordinate In Dispatch',
  accessibilityLabel,
  accessibilityHint = 'Stages a proposal for review in Mission Command. No command is sent by this action.',
  icon = 'radio-outline',
  variant = 'secondary',
  size = 'compact',
  style,
  grow = false,
  numberOfLines = 2,
  onStaged,
  requiredFeature = 'missionCommand',
}: MissionCommandProposalActionProps) {
  const router = useRouter();
  const { showToast } = useApp();
  const inFlightRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const rolloutEnabled = useMemo(() => {
    const rollout = resolveDispatchRolloutConfig();
    return isDispatchFeatureEnabled(rollout, 'missionCommand')
      && isDispatchFeatureEnabled(rollout, requiredFeature);
  }, [requiredFeature]);

  const handlePress = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const proposalResult = buildProposal();
      if (!proposalResult.ok) {
        showToast(proposalResult.reason.toUpperCase());
        return;
      }
      const stageResult = await missionCommandProposalHandoffAdapter.stage(proposalResult.proposal);
      if (stageResult.status === 'invalid') {
        showToast(stageResult.reason.toUpperCase());
        return;
      }
      onStaged?.();
      router.push('/alert' as never);
    } catch {
      showToast('MISSION COMMAND PROPOSAL COULD NOT BE STAGED');
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [buildProposal, onStaged, router, showToast]);

  if (!rolloutEnabled) return null;

  return (
    <ECSButton
      label={busy ? 'Staging' : label}
      icon={icon}
      variant={variant}
      size={size}
      onPress={() => void handlePress()}
      disabled={busy}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      numberOfLines={numberOfLines}
      style={style}
      grow={grow}
    />
  );
}
