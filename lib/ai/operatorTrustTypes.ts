export type ECSOperatorTrustMode =
  | 'conservative_guidance'
  | 'balanced_command'
  | 'minimal_advisory';

export type ECSOperatorTrustDescriptor = {
  mode: ECSOperatorTrustMode;
  label: string;
  shortDescription: string;
  detail: string;
};
