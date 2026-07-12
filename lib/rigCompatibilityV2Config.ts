export type RigCompatibilityV2FeatureFlags = {
  rigCompatibilityV2Enabled?: boolean | null;
};

function environmentFlag(): boolean | null {
  const value = String(process.env.EXPO_PUBLIC_ECS_RIG_COMPATIBILITY_V2 ?? '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(value)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(value)) return false;
  return null;
}

/**
 * V2 is intentionally opt-in while existing compatibility cards and ranking
 * continue to consume the unchanged V1 result.
 */
export function isRigCompatibilityV2Enabled(
  flags?: RigCompatibilityV2FeatureFlags | null,
): boolean {
  if (typeof flags?.rigCompatibilityV2Enabled === 'boolean') {
    return flags.rigCompatibilityV2Enabled;
  }
  return environmentFlag() ?? false;
}
