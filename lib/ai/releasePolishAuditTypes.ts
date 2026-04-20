export type ECSReleaseChecklistStatus = 'healthy' | 'watch' | 'blocker';

export type ECSReleaseChecklistSectionId =
  | 'fleet_surface'
  | 'navigate_surface'
  | 'dashboard_surface'
  | 'explore_surface'
  | 'alert_surface'
  | 'brief_surface'
  | 'shell_surface'
  | 'shared_command_stack'
  | 'shell_restore'
  | 'degraded_offline'
  | 'visual_layout'
  | 'advisory_noise'
  | 'wording'
  | 'admin_cleanliness';

export type ECSReleaseChecklistSection = {
  id: ECSReleaseChecklistSectionId;
  label: string;
  status: ECSReleaseChecklistStatus;
  notes: string[];
};

export type ECSReleaseRiskSeverity = 'must_fix' | 'should_fix' | 'safe_to_defer';

export type ECSReleaseRiskSummary = {
  mustFix: string[];
  shouldFix: string[];
  safeToDefer: string[];
};
