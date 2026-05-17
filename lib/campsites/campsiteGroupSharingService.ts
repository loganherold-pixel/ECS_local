import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../supabase';
import type {
  CampSite,
  CampSiteGroup,
  CampSiteGroupMemberRole,
  CampSiteGroupMembership,
  CampSiteGroupShare,
  CampSiteReport,
} from './campsiteRecommendationTypes';
import type { CampSiteReportResponse, PublicCampSite } from './campsiteRecommendationService';

const CAMP_SITE_GROUPS_TABLE = 'camp_site_groups';
const CAMP_SITE_GROUP_MEMBERSHIPS_TABLE = 'camp_site_group_memberships';
const CAMP_SITE_GROUP_SHARES_TABLE = 'camp_site_group_shares';
const CAMP_SITE_GROUP_AUDIT_EVENTS_TABLE = 'camp_site_group_audit_events';
const CAMP_SITE_REPORTS_TABLE = 'camp_site_reports';
const CAMP_SITES_TABLE = 'camp_sites';
const MAX_GROUP_NAME_LENGTH = 80;

export type CampSiteGroupServiceErrorCode =
  | 'auth_required'
  | 'permission_denied'
  | 'validation_error'
  | 'not_found'
  | 'backend_unavailable'
  | 'backend_error';

export type CampSiteGroupServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: CampSiteGroupServiceErrorCode; error: string; details?: string[] };

export interface AuthenticatedCampSiteGroupUser {
  id: string;
  isAdmin?: boolean;
}

export type CampSiteGroupResponse = Omit<CampSiteGroup, 'owner_user_id' | 'dirty' | 'deleted_at'> & {
  currentUserRole?: CampSiteGroupMemberRole;
};

export type CampSiteGroupMembershipResponse = Omit<
  CampSiteGroupMembership,
  'dirty' | 'deleted_at'
>;

export type CampSiteGroupShareResponse = Omit<
  CampSiteGroupShare,
  'shared_by_user_id' | 'dirty' | 'deleted_at'
>;

export interface CampSiteGroupListItem {
  group: CampSiteGroupResponse;
  membership: CampSiteGroupMembershipResponse;
}

export interface GroupCampSiteItem {
  share: CampSiteGroupShareResponse;
  report: CampSiteReportResponse | null;
  camp_site: PublicCampSite | null;
}

export interface CampSiteGroupSharingConfig {
  membersCanShareReports: boolean;
  membersCanShareApprovedCampSites: boolean;
  allowGroupReportResharing: boolean;
}

export const DEFAULT_CAMP_SITE_GROUP_SHARING_CONFIG: CampSiteGroupSharingConfig = {
  membersCanShareReports: true,
  membersCanShareApprovedCampSites: true,
  allowGroupReportResharing: false,
};

export type CampSiteGroupInsert = Omit<
  CampSiteGroup,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'dirty'
>;
export type CampSiteGroupMembershipInsert = Omit<
  CampSiteGroupMembership,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'dirty'
>;
export type CampSiteGroupShareInsert = Omit<
  CampSiteGroupShare,
  'id' | 'created_at' | 'deleted_at' | 'dirty'
>;
export type CampSiteGroupAuditEventInsert = {
  group_id: string;
  actor_user_id: string | null;
  event_type: 'share_removed';
  metadata: Record<string, unknown>;
};

export interface CampSiteGroupSharingBackend {
  isAvailable(): boolean;
  getCurrentUser(): Promise<AuthenticatedCampSiteGroupUser | null>;
  insertGroup(row: CampSiteGroupInsert): Promise<CampSiteGroupServiceResult<CampSiteGroup>>;
  getGroupById(groupId: string): Promise<CampSiteGroupServiceResult<CampSiteGroup>>;
  insertMembership(
    row: CampSiteGroupMembershipInsert,
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupMembership>>;
  upsertMembership?(
    row: CampSiteGroupMembershipInsert,
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupMembership>>;
  updateMembership(
    membershipId: string,
    changes: Partial<Pick<CampSiteGroupMembership, 'role' | 'status'>>,
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupMembership>>;
  getMembership(
    groupId: string,
    userId: string,
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupMembership | null>>;
  listMembershipsByUser(userId: string): Promise<CampSiteGroupServiceResult<CampSiteGroupMembership[]>>;
  listMembershipsByGroup(groupId: string): Promise<CampSiteGroupServiceResult<CampSiteGroupMembership[]>>;
  insertShare(row: CampSiteGroupShareInsert): Promise<CampSiteGroupServiceResult<CampSiteGroupShare>>;
  getShareById(shareId: string): Promise<CampSiteGroupServiceResult<CampSiteGroupShare>>;
  deleteShare(shareId: string): Promise<CampSiteGroupServiceResult<void>>;
  insertGroupAuditEvent?(
    row: CampSiteGroupAuditEventInsert,
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupAuditEventInsert & { id: string; created_at: string }>>;
  listSharesByGroup(groupId: string): Promise<CampSiteGroupServiceResult<CampSiteGroupShare[]>>;
  getReportById(reportId: string): Promise<CampSiteGroupServiceResult<CampSiteReport>>;
  updateReport(
    reportId: string,
    changes: Partial<CampSiteReport>,
  ): Promise<CampSiteGroupServiceResult<CampSiteReport>>;
  getCampSiteById(campSiteId: string): Promise<CampSiteGroupServiceResult<CampSite>>;
}

function toError(
  code: CampSiteGroupServiceErrorCode,
  error: string,
  details?: string[],
): CampSiteGroupServiceResult<never> {
  return { ok: false, code, error, details };
}

function mapBackendError(error: unknown, fallback = 'Campsite group sharing request failed.') {
  const maybeError = error as { message?: string } | null;
  return toError('backend_error', maybeError?.message ?? fallback);
}

function sanitizeGroupName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP_NAME_LENGTH);
}

function isActiveMember(membership: CampSiteGroupMembership | null | undefined): membership is CampSiteGroupMembership {
  return membership?.status === 'active';
}

function isAdminMembership(
  membership: CampSiteGroupMembership | null | undefined,
): membership is CampSiteGroupMembership {
  return isActiveMember(membership) && (membership.role === 'owner' || membership.role === 'admin');
}

function omitGroupOwner(group: CampSiteGroup, role?: CampSiteGroupMemberRole): CampSiteGroupResponse {
  const { owner_user_id: _ownerUserId, dirty: _dirty, deleted_at: _deletedAt, ...safe } = group;
  return { ...safe, currentUserRole: role };
}

function omitMembershipPrivateFields(
  membership: CampSiteGroupMembership,
): CampSiteGroupMembershipResponse {
  const { dirty: _dirty, deleted_at: _deletedAt, ...safe } = membership;
  return safe;
}

function omitSharePrivateFields(share: CampSiteGroupShare): CampSiteGroupShareResponse {
  const { shared_by_user_id: _sharedByUserId, dirty: _dirty, deleted_at: _deletedAt, ...safe } = share;
  return safe;
}

function omitReportPii(report: CampSiteReport): CampSiteReportResponse {
  const { submitted_by_user_id: _submittedByUserId, dirty: _dirty, deleted_at: _deletedAt, ...safe } = report;
  return safe;
}

function omitCampSitePrivateFields(site: CampSite): PublicCampSite {
  const {
    owner_user_id: _ownerUserId,
    authorized_user_ids: _authorizedUserIds,
    dirty: _dirty,
    deleted_at: _deletedAt,
    ...safe
  } = site;
  return safe;
}

function isWithinBounds(
  item: { latitude: number; longitude: number },
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number },
): boolean {
  return (
    item.latitude >= bounds.minLat &&
    item.latitude <= bounds.maxLat &&
    item.longitude >= bounds.minLng &&
    item.longitude <= bounds.maxLng
  );
}

async function requireUser(
  backend: CampSiteGroupSharingBackend,
): Promise<CampSiteGroupServiceResult<AuthenticatedCampSiteGroupUser>> {
  if (!backend.isAvailable()) {
    return toError('backend_unavailable', 'Campsite group sharing backend is not configured.');
  }
  const user = await backend.getCurrentUser();
  if (!user?.id) return toError('auth_required', 'Sign in to use campsite group sharing.');
  return { ok: true, data: user };
}

export class CampSiteGroupSharingService {
  private readonly config: CampSiteGroupSharingConfig;

  constructor(
    private readonly backend: CampSiteGroupSharingBackend,
    config: Partial<CampSiteGroupSharingConfig> = {},
  ) {
    this.config = { ...DEFAULT_CAMP_SITE_GROUP_SHARING_CONFIG, ...config };
  }

  async createCampSiteGroup(name: string): Promise<CampSiteGroupServiceResult<CampSiteGroupListItem>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;
    const cleanName = sanitizeGroupName(name);
    if (!cleanName) return toError('validation_error', 'Group name is required.');

    const group = await this.backend.insertGroup({
      name: cleanName,
      owner_user_id: user.data.id,
      visibility: 'private_group',
    });
    if (!group.ok) return group;

    const membership = await this.backend.insertMembership({
      group_id: group.data.id,
      user_id: user.data.id,
      role: 'owner',
      status: 'active',
    });
    if (!membership.ok) return membership;

    return {
      ok: true,
      data: {
        group: omitGroupOwner(group.data, 'owner'),
        membership: omitMembershipPrivateFields(membership.data),
      },
    };
  }

  async addGroupMember(
    groupId: string,
    userId: string,
    role: CampSiteGroupMemberRole = 'member',
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupMembershipResponse>> {
    const current = await this.requireGroupAdmin(groupId);
    if (!current.ok) return current;
    if (!userId) return toError('validation_error', 'userId is required.');
    if (role === 'owner' && current.data.role !== 'owner') {
      return toError('permission_denied', 'Only the group owner can add another owner.');
    }

    const row: CampSiteGroupMembershipInsert = {
      group_id: groupId,
      user_id: userId,
      role,
      status: 'active',
    };
    const result = this.backend.upsertMembership
      ? await this.backend.upsertMembership(row)
      : await this.backend.insertMembership(row);
    if (!result.ok) return result;
    return { ok: true, data: omitMembershipPrivateFields(result.data) };
  }

  async inviteGroupMember(
    groupId: string,
    userId: string,
    role: CampSiteGroupMemberRole = 'member',
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupMembershipResponse>> {
    return this.addGroupMember(groupId, userId, role);
  }

  async removeGroupMember(
    groupId: string,
    userId: string,
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupMembershipResponse>> {
    const current = await this.requireGroupAdmin(groupId);
    if (!current.ok) return current;
    const membership = await this.backend.getMembership(groupId, userId);
    if (!membership.ok) return membership;
    if (!membership.data) return toError('not_found', 'Group member was not found.');
    if (membership.data.role === 'owner' && current.data.role !== 'owner') {
      return toError('permission_denied', 'Only the group owner can remove another owner.');
    }
    const updated = await this.backend.updateMembership(membership.data.id, { status: 'removed' });
    if (!updated.ok) return updated;
    return { ok: true, data: omitMembershipPrivateFields(updated.data) };
  }

  async listMyCampSiteGroups(): Promise<CampSiteGroupServiceResult<CampSiteGroupListItem[]>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;
    const memberships = await this.backend.listMembershipsByUser(user.data.id);
    if (!memberships.ok) return memberships;

    const items: CampSiteGroupListItem[] = [];
    for (const membership of memberships.data.filter((item) => item.status !== 'removed')) {
      const group = await this.backend.getGroupById(membership.group_id);
      if (group.ok) {
        items.push({
          group: omitGroupOwner(group.data, membership.role),
          membership: omitMembershipPrivateFields(membership),
        });
      }
    }
    return { ok: true, data: items };
  }

  async listGroupMembers(
    groupId: string,
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupMembershipResponse[]>> {
    const member = await this.requireActiveGroupMember(groupId);
    if (!member.ok) return member;
    const result = await this.backend.listMembershipsByGroup(groupId);
    if (!result.ok) return result;
    return {
      ok: true,
      data: result.data
        .filter((membership) => membership.status !== 'removed')
        .map(omitMembershipPrivateFields),
    };
  }

  async shareCampSiteReportToGroup(
    campSiteReportId: string,
    groupId: string,
  ): Promise<CampSiteGroupServiceResult<GroupCampSiteItem>> {
    const member = await this.requireActiveGroupMember(groupId);
    if (!member.ok) return member;
    if (!this.config.membersCanShareReports && member.data.role === 'member') {
      return toError('permission_denied', 'Members cannot share campsite reports to this group.');
    }
    const report = await this.backend.getReportById(campSiteReportId);
    if (!report.ok) return report;
    const user = await requireUser(this.backend);
    if (!user.ok) return user;
    const ownsReport = report.data.submitted_by_user_id === user.data.id;
    if (!ownsReport) {
      if (!this.config.allowGroupReportResharing) {
        return toError('permission_denied', 'You can only share campsite reports you own.');
      }
      const visible = await this.isReportVisibleThroughAGroup(campSiteReportId, user.data.id);
      if (!visible) return toError('permission_denied', 'This campsite report is not visible to you.');
    }

    const share = await this.backend.insertShare({
      camp_site_report_id: campSiteReportId,
      camp_site_id: null,
      group_id: groupId,
      shared_by_user_id: user.data.id,
    });
    if (!share.ok) return share;
    return {
      ok: true,
      data: {
        share: omitSharePrivateFields(share.data),
        report: omitReportPii(report.data),
        camp_site: null,
      },
    };
  }

  async shareApprovedCampSiteToGroup(
    campSiteId: string,
    groupId: string,
  ): Promise<CampSiteGroupServiceResult<GroupCampSiteItem>> {
    const member = await this.requireActiveGroupMember(groupId);
    if (!member.ok) return member;
    if (!this.config.membersCanShareApprovedCampSites && member.data.role === 'member') {
      return toError('permission_denied', 'Members cannot share reviewed campsite records to this group.');
    }
    const user = await requireUser(this.backend);
    if (!user.ok) return user;
    const site = await this.backend.getCampSiteById(campSiteId);
    if (!site.ok) return site;
    if (site.data.status !== 'approved' || site.data.visibility !== 'community') {
      return toError('validation_error', 'Only reviewed public campsites can be shared by campsite ID.');
    }
    const share = await this.backend.insertShare({
      camp_site_report_id: null,
      camp_site_id: campSiteId,
      group_id: groupId,
      shared_by_user_id: user.data.id,
    });
    if (!share.ok) return share;
    return {
      ok: true,
      data: {
        share: omitSharePrivateFields(share.data),
        report: null,
        camp_site: omitCampSitePrivateFields(site.data),
      },
    };
  }

  async removeGroupShare(shareId: string): Promise<CampSiteGroupServiceResult<void>> {
    const share = await this.backend.getShareById(shareId);
    if (!share.ok) return share;
    const admin = await this.requireGroupAdmin(share.data.group_id);
    if (!admin.ok) return admin;
    const deleted = await this.backend.deleteShare(shareId);
    if (!deleted.ok) return deleted;
    await this.backend.insertGroupAuditEvent?.({
      group_id: share.data.group_id,
      actor_user_id: admin.data.user_id,
      event_type: 'share_removed',
      metadata: {
        share_id: shareId,
        camp_site_report_id: share.data.camp_site_report_id,
        camp_site_id: share.data.camp_site_id,
      },
    });
    return deleted;
  }

  async listGroupCampSites(groupId: string): Promise<CampSiteGroupServiceResult<GroupCampSiteItem[]>> {
    const member = await this.requireActiveGroupMember(groupId);
    if (!member.ok) return member;
    const shares = await this.backend.listSharesByGroup(groupId);
    if (!shares.ok) return shares;
    const items: GroupCampSiteItem[] = [];
    for (const share of shares.data) {
      const item = await this.hydrateGroupCampSiteItem(share);
      if (item.ok) items.push(item.data);
    }
    return { ok: true, data: items };
  }

  async listGroupCampSitesByMapBounds(
    groupId: string,
    bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number },
  ): Promise<CampSiteGroupServiceResult<GroupCampSiteItem[]>> {
    const result = await this.listGroupCampSites(groupId);
    if (!result.ok) return result;
    return {
      ok: true,
      data: result.data.filter((item) => {
        const target = item.camp_site ?? item.report;
        return target ? isWithinBounds(target, bounds) : false;
      }),
    };
  }

  async submitGroupCampSiteReportToCommunityReview(
    campSiteReportId: string,
    acknowledgements: {
      stewardship_acknowledged: boolean;
      sensitive_area_acknowledged: boolean;
    },
  ): Promise<CampSiteGroupServiceResult<CampSiteReportResponse>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;
    if (!acknowledgements.stewardship_acknowledged || !acknowledgements.sensitive_area_acknowledged) {
      return toError(
        'validation_error',
        'Community review requires stewardship and sensitive-area acknowledgements.',
      );
    }
    const report = await this.backend.getReportById(campSiteReportId);
    if (!report.ok) return report;
    if (report.data.submitted_by_user_id !== user.data.id) {
      return toError('permission_denied', 'Only the report owner can submit it to community review.');
    }
    const updated = await this.backend.updateReport(campSiteReportId, {
      visibility_requested: 'community',
      moderation_status: 'pending',
      review_state: 'submitted',
      stewardship_acknowledged: true,
      sensitive_area_acknowledged: true,
    });
    if (!updated.ok) return updated;
    return { ok: true, data: omitReportPii(updated.data) };
  }

  private async hydrateGroupCampSiteItem(
    share: CampSiteGroupShare,
  ): Promise<CampSiteGroupServiceResult<GroupCampSiteItem>> {
    if (share.camp_site_report_id) {
      const report = await this.backend.getReportById(share.camp_site_report_id);
      if (!report.ok) return report;
      return {
        ok: true,
        data: {
          share: omitSharePrivateFields(share),
          report: omitReportPii(report.data),
          camp_site: null,
        },
      };
    }
    if (share.camp_site_id) {
      const site = await this.backend.getCampSiteById(share.camp_site_id);
      if (!site.ok) return site;
      return {
        ok: true,
        data: {
          share: omitSharePrivateFields(share),
          report: null,
          camp_site: omitCampSitePrivateFields(site.data),
        },
      };
    }
    return toError('validation_error', 'Group share has no campsite target.');
  }

  private async requireActiveGroupMember(
    groupId: string,
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupMembership>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;
    const membership = await this.backend.getMembership(groupId, user.data.id);
    if (!membership.ok) return membership;
    if (!isActiveMember(membership.data)) {
      return toError('permission_denied', 'You are not a member of this campsite group.');
    }
    return { ok: true, data: membership.data };
  }

  private async requireGroupAdmin(
    groupId: string,
  ): Promise<CampSiteGroupServiceResult<CampSiteGroupMembership>> {
    const user = await requireUser(this.backend);
    if (!user.ok) return user;
    if (user.data.isAdmin) {
      const membership = await this.backend.getMembership(groupId, user.data.id);
      return {
        ok: true,
        data:
          membership.ok && membership.data
            ? membership.data
            : {
                id: `admin:${user.data.id}:${groupId}`,
                group_id: groupId,
                user_id: user.data.id,
                role: 'admin',
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
      };
    }
    const membership = await this.backend.getMembership(groupId, user.data.id);
    if (!membership.ok) return membership;
    const activeMembership = membership.data;
    if (!isAdminMembership(activeMembership)) {
      return toError('permission_denied', 'Only group owners or admins can manage this group.');
    }
    return { ok: true, data: activeMembership };
  }

  private async isReportVisibleThroughAGroup(reportId: string, userId: string): Promise<boolean> {
    const memberships = await this.backend.listMembershipsByUser(userId);
    if (!memberships.ok) return false;
    for (const membership of memberships.data.filter(isActiveMember)) {
      const shares = await this.backend.listSharesByGroup(membership.group_id);
      if (
        shares.ok &&
        shares.data.some((share) => share.camp_site_report_id === reportId)
      ) {
        return true;
      }
    }
    return false;
  }
}

type SupabaseResponse<T> = {
  data: T | null;
  error: { message?: string } | null;
};

function normalizeSupabaseArray<T>(result: { data: T[] | null; error: { message?: string } | null }) {
  if (result.error || !Array.isArray(result.data)) return mapBackendError(result.error);
  return { ok: true, data: result.data } as const;
}

export function createSupabaseCampSiteGroupSharingBackend(
  client: SupabaseClient = supabase,
): CampSiteGroupSharingBackend {
  return {
    isAvailable() {
      return isSupabaseConfigured;
    },

    async getCurrentUser() {
      const { data } = await client.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) return null;
      const operatorResult = (await client
        .from('operators')
        .select('role,status')
        .eq('user_id', userId)
        .maybeSingle()) as SupabaseResponse<{ role?: string | null; status?: string | null }>;
      return {
        id: userId,
        isAdmin:
          operatorResult.data?.role === 'super_admin' &&
          operatorResult.data?.status === 'active',
      };
    },

    async insertGroup(row) {
      const result = (await client
        .from(CAMP_SITE_GROUPS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteGroup>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getGroupById(groupId) {
      const result = (await client
        .from(CAMP_SITE_GROUPS_TABLE)
        .select('*')
        .eq('id', groupId)
        .single()) as SupabaseResponse<CampSiteGroup>;
      if (result.error || !result.data) return toError('not_found', 'Campsite group was not found.');
      return { ok: true, data: result.data };
    },

    async insertMembership(row) {
      const result = (await client
        .from(CAMP_SITE_GROUP_MEMBERSHIPS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteGroupMembership>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async upsertMembership(row) {
      const result = (await client
        .from(CAMP_SITE_GROUP_MEMBERSHIPS_TABLE)
        .upsert(row, { onConflict: 'group_id,user_id' })
        .select('*')
        .single()) as SupabaseResponse<CampSiteGroupMembership>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async updateMembership(membershipId, changes) {
      const result = (await client
        .from(CAMP_SITE_GROUP_MEMBERSHIPS_TABLE)
        .update(changes)
        .eq('id', membershipId)
        .select('*')
        .single()) as SupabaseResponse<CampSiteGroupMembership>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getMembership(groupId, userId) {
      const result = (await client
        .from(CAMP_SITE_GROUP_MEMBERSHIPS_TABLE)
        .select('*')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle()) as SupabaseResponse<CampSiteGroupMembership>;
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: result.data ?? null };
    },

    async listMembershipsByUser(userId) {
      return normalizeSupabaseArray<CampSiteGroupMembership>(
        (await client
          .from(CAMP_SITE_GROUP_MEMBERSHIPS_TABLE)
          .select('*')
          .eq('user_id', userId)
          .neq('status', 'removed')
          .order('updated_at', { ascending: false })) as any,
      );
    },

    async listMembershipsByGroup(groupId) {
      return normalizeSupabaseArray<CampSiteGroupMembership>(
        (await client
          .from(CAMP_SITE_GROUP_MEMBERSHIPS_TABLE)
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: true })) as any,
      );
    },

    async insertShare(row) {
      const result = (await client
        .from(CAMP_SITE_GROUP_SHARES_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteGroupShare>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getShareById(shareId) {
      const result = (await client
        .from(CAMP_SITE_GROUP_SHARES_TABLE)
        .select('*')
        .eq('id', shareId)
        .single()) as SupabaseResponse<CampSiteGroupShare>;
      if (result.error || !result.data) return toError('not_found', 'Group campsite share was not found.');
      return { ok: true, data: result.data };
    },

    async deleteShare(shareId) {
      const result = (await client
        .from(CAMP_SITE_GROUP_SHARES_TABLE)
        .delete()
        .eq('id', shareId)) as { error: { message?: string } | null };
      if (result.error) return mapBackendError(result.error);
      return { ok: true, data: undefined };
    },

    async insertGroupAuditEvent(row) {
      const result = (await client
        .from(CAMP_SITE_GROUP_AUDIT_EVENTS_TABLE)
        .insert(row)
        .select('*')
        .single()) as SupabaseResponse<CampSiteGroupAuditEventInsert & { id: string; created_at: string }>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async listSharesByGroup(groupId) {
      return normalizeSupabaseArray<CampSiteGroupShare>(
        (await client
          .from(CAMP_SITE_GROUP_SHARES_TABLE)
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })) as any,
      );
    },

    async getReportById(reportId) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .select('*')
        .eq('id', reportId)
        .single()) as SupabaseResponse<CampSiteReport>;
      if (result.error || !result.data) return toError('not_found', 'Campsite report was not found.');
      return { ok: true, data: result.data };
    },

    async updateReport(reportId, changes) {
      const result = (await client
        .from(CAMP_SITE_REPORTS_TABLE)
        .update(changes)
        .eq('id', reportId)
        .select('*')
        .single()) as SupabaseResponse<CampSiteReport>;
      if (result.error || !result.data) return mapBackendError(result.error);
      return { ok: true, data: result.data };
    },

    async getCampSiteById(campSiteId) {
      const result = (await client
        .from(CAMP_SITES_TABLE)
        .select('*')
        .eq('id', campSiteId)
        .single()) as SupabaseResponse<CampSite>;
      if (result.error || !result.data) return toError('not_found', 'Campsite was not found.');
      return { ok: true, data: result.data };
    },
  };
}

export const campSiteGroupSharingService = new CampSiteGroupSharingService(
  createSupabaseCampSiteGroupSharingBackend(),
);
