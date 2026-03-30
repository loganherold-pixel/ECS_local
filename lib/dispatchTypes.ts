// ============================================================
// ECS DISPATCH FEED — TYPE DEFINITIONS
// ============================================================

export type DispatchEventType =
  | 'status_update'
  | 'location_checkin'
  | 'issue_report'
  | 'safety_notice'
  | 'resource_update'
  | 'task_completed';

export type DispatchPriority = 'normal' | 'critical';

export type ExpeditionMemberRole = 'owner' | 'member' | 'viewer';

export type DispatchExpeditionStatus = 'draft' | 'active' | 'archived';

export interface DispatchEvent {
  id: string;
  expedition_id: string;
  created_by_user_id: string;
  event_type: DispatchEventType;
  priority: DispatchPriority;
  headline: string;
  detail: string | null;
  location_enabled: boolean;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
  // Enriched fields from edge function
  created_by_email?: string | null;
  created_by_display_name?: string | null;
}

export interface ExpeditionMember {
  id: string;
  expedition_id: string;
  user_id: string;
  role: ExpeditionMemberRole;
  joined_at: string;
  left_at: string | null;
}

/** Enriched member with display info from auth */
export interface ExpeditionMemberEnriched extends ExpeditionMember {
  email: string | null;
  display_name: string | null;
}

export interface ExpeditionInvite {
  id: string;
  expedition_id: string;
  invite_code: string;
  created_by_user_id: string;
  expires_at: string;
  max_uses: number | null;
  used_count: number;
  created_at: string;
  // Annotated fields from edge function
  is_expired?: boolean;
  is_maxed?: boolean;
  is_active?: boolean;
  remaining_uses?: number | null;
  expedition_title?: string | null;
}

/** Response from get_invite_info action */
export interface InviteInfo {
  invite_code: string;
  expedition_id: string;
  expedition_title: string | null;
  expedition_status: string | null;
  expires_at: string;
  remaining_uses: number | null;
  is_expired: boolean;
  is_maxed: boolean;
  is_valid: boolean;
  already_member: boolean;
}

/** Response shape from list_members with caller context */
export interface ListMembersResponse {
  members: ExpeditionMemberEnriched[];
  member_count: number;
  expedition_title: string | null;
  your_role: ExpeditionMemberRole | null;
}


// ── UI Display Mapping ──────────────────────────────────────

export const EVENT_TYPE_META: Record<DispatchEventType, { label: string; icon: string; color: string }> = {
  status_update:   { label: 'Status',    icon: 'radio-outline',          color: '#42A5F5' },
  location_checkin: { label: 'Check-In', icon: 'location-outline',      color: '#66BB6A' },
  issue_report:    { label: 'Issue',     icon: 'alert-circle-outline',  color: '#EF5350' },
  safety_notice:   { label: 'Safety',    icon: 'shield-checkmark-outline', color: '#FF7043' },
  resource_update: { label: 'Resource',  icon: 'cube-outline',          color: '#AB47BC' },
  task_completed:  { label: 'Task',      icon: 'checkmark-circle-outline', color: '#26A69A' },
};

export const ALL_EVENT_TYPES: DispatchEventType[] = [
  'status_update',
  'location_checkin',
  'issue_report',
  'safety_notice',
  'resource_update',
  'task_completed',
];

// ── Compose form state ──────────────────────────────────────

export interface ComposeEventForm {
  event_type: DispatchEventType;
  priority: DispatchPriority;
  headline: string;
  detail: string;
  location_enabled: boolean;
  location_label: string;
  latitude: string;
  longitude: string;
  metadata: Record<string, any> | null;
}

export const EMPTY_COMPOSE_FORM: ComposeEventForm = {
  event_type: 'status_update',
  priority: 'normal',
  headline: '',
  detail: '',
  location_enabled: false,
  location_label: '',
  latitude: '',
  longitude: '',
  metadata: null,
};

// ── Validation ──────────────────────────────────────────────

export interface ValidationErrors {
  headline?: string;
  latitude?: string;
  longitude?: string;
  detail?: string;
}

export function validateComposeForm(form: ComposeEventForm): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!form.headline.trim()) {
    errors.headline = 'Headline is required';
  } else if (form.headline.trim().length > 80) {
    errors.headline = 'Headline must be 80 characters or less';
  }

  if (form.detail && form.detail.length > 400) {
    errors.detail = 'Detail must be 400 characters or less';
  }

  if (form.location_enabled) {
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Valid latitude required (-90 to 90)';
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = 'Valid longitude required (-180 to 180)';
    }
  }

  return errors;
}

export function hasValidationErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

