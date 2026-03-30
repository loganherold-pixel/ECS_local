// ============================================================
// ECS DISPATCH — EXPEDITION MEMBERS PANEL
// ============================================================
// Modal showing all expedition members with role badges,
// invite generation (owner-only), join-via-code flow with
// pre-validation, role management, revoke invites, and leave.

import React, { useState, useEffect, useCallback, useRef } from 'react';

import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, Platform, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { dispatchStore } from '../../lib/dispatchStore';
import type {
  ExpeditionMemberEnriched,
  ExpeditionMemberRole,
  ExpeditionInvite,
  InviteInfo,
} from '../../lib/dispatchTypes';

interface Props {
  visible: boolean;
  onClose: () => void;
  expeditionId: string;
  currentUserRole: ExpeditionMemberRole | null;
  currentUserId?: string | null;
  onMembershipChanged?: () => void;
}

// ── Role display config ──────────────────────────────────────
const ROLE_CONFIG: Record<ExpeditionMemberRole, { label: string; color: string; icon: string }> = {
  owner:  { label: 'OWNER',  color: '#C48A2C', icon: 'shield-outline' },
  member: { label: 'MEMBER', color: '#66BB6A', icon: 'person-outline' },
  viewer: { label: 'VIEWER', color: '#8A8A85', icon: 'eye-outline' },
};

const ROLE_OPTIONS: ExpeditionMemberRole[] = ['owner', 'member', 'viewer'];

// ── Time formatting helpers ──────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatExpiryTime(dateStr: string): string {
  const now = new Date();
  const expiry = new Date(dateStr);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  if (diffHr < 1) return `${diffMin}m remaining`;
  if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m remaining`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ${diffHr % 24}h remaining`;
}

function getDisplayName(m: ExpeditionMemberEnriched): string {
  if (m.display_name) return m.display_name;
  if (m.email) {
    const local = m.email.split('@')[0];
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return m.user_id.substring(0, 8) + '...';
}

function getInitials(m: ExpeditionMemberEnriched): string {
  if (m.display_name) {
    const parts = m.display_name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return m.display_name.substring(0, 2).toUpperCase();
  }
  if (m.email) return m.email.substring(0, 2).toUpperCase();
  return m.user_id.substring(0, 2).toUpperCase();
}

export default function MembersPanel({
  visible,
  onClose,
  expeditionId,
  currentUserRole,
  currentUserId,
  onMembershipChanged,
}: Props) {
  // ── State ──────────────────────────────────────────────────
  const [members, setMembers] = useState<ExpeditionMemberEnriched[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [expeditionTitle, setExpeditionTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite state
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [activeInvite, setActiveInvite] = useState<ExpeditionInvite | null>(null);
  const [existingInvites, setExistingInvites] = useState<ExpeditionInvite[]>([]);
  const [inviteCopied, setInviteCopied] = useState<string | null>(null);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  // Join state
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [joinResult, setJoinResult] = useState<{
    already_member?: boolean;
    message?: string;
    expedition_title?: string | null;
    invite_remaining_uses?: number | null;
    invite_expires_at?: string;
  } | null>(null);
  // Pre-validation info
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  // Role editing
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState(false);

  // Leave
  const [leaving, setLeaving] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<'members' | 'join'>('members');

  const isOwner = currentUserRole === 'owner';

  // ── Load members ───────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    if (!expeditionId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await dispatchStore.listMembers(expeditionId);
      if (fetchErr) {
        setError(fetchErr);
      } else if (data) {
        setMembers(data.members || []);
        setMemberCount(data.member_count || 0);
        setExpeditionTitle(data.expedition_title || null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load members');
    }
    setLoading(false);
  }, [expeditionId]);

  // ── Load existing invites (owner only) ─────────────────────
  const fetchInvites = useCallback(async () => {
    if (!expeditionId || !isOwner) return;
    setLoadingInvites(true);
    try {
      const { data, error: invErr } = await dispatchStore.listInvites(expeditionId, false);
      if (!invErr && data) {
        setExistingInvites(data);
      }
    } catch {}
    setLoadingInvites(false);
  }, [expeditionId, isOwner]);

  useEffect(() => {
    if (visible) {
      fetchMembers();
      fetchInvites();
      setActiveInvite(null);
      setInviteCopied(null);
      setJoinCode('');
      setJoinError(null);
      setJoinSuccess(false);
      setJoinResult(null);
      setInviteInfo(null);
      setEditingMemberId(null);
    }
  }, [visible, fetchMembers, fetchInvites]);

  // ── Generate invite ────────────────────────────────────────
  const handleGenerateInvite = async () => {
    setGeneratingInvite(true);
    setInviteCopied(null);
    try {
      const { data, error: invErr } = await dispatchStore.createInvite(expeditionId, 20, 24);
      if (invErr) {
        setError(invErr);
      } else if (data) {
        setActiveInvite(data);
        fetchInvites();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate invite');
    }
    setGeneratingInvite(false);
  };

  // ── Copy invite code ───────────────────────────────────────
  const handleCopyCode = async (code: string) => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
      }
      setInviteCopied(code);
      setTimeout(() => setInviteCopied(null), 3000);
    } catch {
      setInviteCopied(code);
      setTimeout(() => setInviteCopied(null), 3000);
    }
  };

  // ── Revoke invite ──────────────────────────────────────────
  const handleRevokeInvite = async (inviteId: string) => {
    const doRevoke = async () => {
      setRevokingInviteId(inviteId);
      try {
        const { error: revErr } = await dispatchStore.revokeInvite(expeditionId, inviteId);
        if (revErr) {
          setError(revErr);
        } else {
          // Remove from local list
          setExistingInvites(prev => prev.filter(i => i.id !== inviteId));
          if (activeInvite?.id === inviteId) {
            setActiveInvite(null);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to revoke invite');
      }
      setRevokingInviteId(null);
    };

    if (Platform.OS === 'web') {
      if (confirm('Revoke this invite code? It will no longer be usable.')) {
        doRevoke();
      }
    } else {
      Alert.alert(
        'Revoke Invite',
        'This invite code will no longer be usable. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Revoke', style: 'destructive', onPress: doRevoke },
        ]
      );
    }
  };

  // ── Check invite code (pre-validation) ─────────────────────
  const handleCheckCode = async (code: string) => {
    if (code.trim().length < 4) {
      setInviteInfo(null);
      return;
    }
    setCheckingCode(true);
    try {
      const { data } = await dispatchStore.getInviteInfo(code.trim());
      setInviteInfo(data || null);
    } catch {
      setInviteInfo(null);
    }
    setCheckingCode(false);
  };

  // ── Join via invite code ───────────────────────────────────
  const handleJoin = async () => {
    const code = joinCode.trim();
    if (!code) {
      setJoinError('Please enter an invite code');
      return;
    }

    setJoining(true);
    setJoinError(null);
    setJoinSuccess(false);
    setJoinResult(null);

    try {
      const { data, error: joinErr } = await dispatchStore.joinInvite(code);
      if (joinErr) {
        setJoinError(joinErr);
      } else if (data) {
        setJoinSuccess(true);
        setJoinCode('');
        setInviteInfo(null);
        setJoinResult({
          already_member: data.already_member,
          message: data.message,
          expedition_title: data.expedition_title,
          invite_remaining_uses: data.invite_remaining_uses,
          invite_expires_at: data.invite_expires_at,
        });
        await fetchMembers();
        onMembershipChanged?.();
      }
    } catch (err: any) {
      setJoinError(err.message || 'Failed to join');
    }
    setJoining(false);
  };

  // ── Update member role ─────────────────────────────────────
  const handleRoleChange = async (targetUserId: string, newRole: ExpeditionMemberRole) => {
    setUpdatingRole(true);
    try {
      const { data: updatedMember, error: roleErr } = await dispatchStore.updateMemberRole(
        expeditionId,
        targetUserId,
        newRole as 'member' | 'viewer' | 'owner'
      );
      if (roleErr) {
        setError(roleErr);
      } else {
        // Update local state with enriched data from response
        setMembers(prev =>
          prev.map(m =>
            m.user_id === targetUserId
              ? {
                  ...m,
                  role: newRole,
                  email: updatedMember?.email ?? m.email,
                  display_name: updatedMember?.display_name ?? m.display_name,
                }
              : m
          )
        );
        setEditingMemberId(null);
        onMembershipChanged?.();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
    }
    setUpdatingRole(false);
  };

  // ── Leave expedition ───────────────────────────────────────
  const handleLeave = () => {
    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to leave this expedition?')) {
        doLeave();
      }
    } else {
      Alert.alert(
        'Leave Expedition',
        'Are you sure you want to leave this expedition? You can rejoin later with an invite code.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: doLeave },
        ]
      );
    }
  };

  const doLeave = async () => {
    setLeaving(true);
    try {
      const { error: leaveErr } = await dispatchStore.leaveExpedition(expeditionId);
      if (leaveErr) {
        setError(leaveErr);
      } else {
        onMembershipChanged?.();
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to leave');
    }
    setLeaving(false);
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          {/* ── Header ──────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="people-outline" size={17} color={TACTICAL.amber} />
              <View>
                <Text style={styles.headerTitle}>EXPEDITION CREW</Text>
                {expeditionTitle && (
                  <Text style={styles.headerSubtitle} numberOfLines={1}>{expeditionTitle}</Text>
                )}
              </View>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{memberCount}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Tab Switcher ──────────────────────────────────── */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'members' && styles.tabActive]}
              onPress={() => setActiveTab('members')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="people-outline"
                size={13}
                color={activeTab === 'members' ? TACTICAL.amber : TACTICAL.textMuted}
              />
              <Text style={[
                styles.tabText,
                activeTab === 'members' && styles.tabTextActive,
              ]}>
                MEMBERS ({memberCount})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'join' && styles.tabActive]}
              onPress={() => setActiveTab('join')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="enter-outline"
                size={13}
                color={activeTab === 'join' ? TACTICAL.amber : TACTICAL.textMuted}
              />
              <Text style={[
                styles.tabText,
                activeTab === 'join' && styles.tabTextActive,
              ]}>
                JOIN
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Error Banner ─────────────────────────────── */}
            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="warning-outline" size={14} color={TACTICAL.danger} />
                <Text style={styles.errorBannerText}>{error}</Text>
                <TouchableOpacity onPress={() => setError(null)}>
                  <Ionicons name="close-circle-outline" size={16} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* ═══════════════════════════════════════════════ */}
            {/* ── MEMBERS TAB ─────────────────────────────── */}
            {/* ═══════════════════════════════════════════════ */}
            {activeTab === 'members' && (
              <>
                {loading ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator size="small" color={TACTICAL.amber} />
                    <Text style={styles.loadingText}>LOADING CREW...</Text>
                  </View>
                ) : members.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="people-outline" size={36} color={TACTICAL.textMuted} />
                    <Text style={styles.emptyTitle}>NO MEMBERS</Text>
                    <Text style={styles.emptySubtitle}>
                      No crew members found for this expedition.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.membersList}>
                    {members.map((m) => {
                      const role = ROLE_CONFIG[m.role] || ROLE_CONFIG.viewer;
                      const isCurrentUser = currentUserId && m.user_id === currentUserId;
                      const isEditing = editingMemberId === m.id;

                      return (
                        <View key={m.id}>
                          <View style={styles.memberRow}>
                            {/* Avatar */}
                            <View style={[styles.avatar, { borderColor: role.color }]}>
                              <Text style={[styles.avatarText, { color: role.color }]}>
                                {getInitials(m)}
                              </Text>
                            </View>

                            {/* Info */}
                            <View style={styles.memberInfo}>
                              <View style={styles.nameRow}>
                                <Text style={styles.memberName} numberOfLines={1}>
                                  {getDisplayName(m)}
                                </Text>
                                {isCurrentUser && (
                                  <View style={styles.youBadge}>
                                    <Text style={styles.youBadgeText}>YOU</Text>
                                  </View>
                                )}
                              </View>
                              {m.email && (
                                <Text style={styles.memberEmail} numberOfLines={1}>
                                  {m.email}
                                </Text>
                              )}
                              <Text style={styles.memberJoined}>
                                Joined {formatRelativeTime(m.joined_at)}
                              </Text>
                            </View>

                            {/* Role Badge / Edit */}
                            <TouchableOpacity
                              style={[styles.roleBadge, { borderColor: role.color }]}
                              onPress={() => {
                                if (isOwner && !isCurrentUser) {
                                  setEditingMemberId(isEditing ? null : m.id);
                                }
                              }}
                              disabled={!isOwner || !!isCurrentUser}
                              activeOpacity={isOwner && !isCurrentUser ? 0.7 : 1}
                            >
                              <Ionicons name={role.icon as any} size={10} color={role.color} />
                              <Text style={[styles.roleBadgeText, { color: role.color }]}>
                                {role.label}
                              </Text>
                              {isOwner && !isCurrentUser && (
                                <Ionicons
                                  name={isEditing ? 'chevron-up' : 'chevron-down'}
                                  size={10}
                                  color={role.color}
                                />
                              )}
                            </TouchableOpacity>
                          </View>

                          {/* Role Picker (expanded) */}
                          {isEditing && isOwner && (
                            <View style={styles.rolePickerRow}>
                              {ROLE_OPTIONS.map((r) => {
                                const rc = ROLE_CONFIG[r];
                                const isActive = m.role === r;
                                return (
                                  <TouchableOpacity
                                    key={r}
                                    style={[
                                      styles.roleOption,
                                      isActive && { borderColor: rc.color, backgroundColor: `${rc.color}10` },
                                    ]}
                                    onPress={() => {
                                      if (!isActive) handleRoleChange(m.user_id, r);
                                    }}
                                    disabled={isActive || updatingRole}
                                    activeOpacity={0.7}
                                  >
                                    {updatingRole && !isActive ? (
                                      <ActivityIndicator size={10} color={rc.color} />
                                    ) : (
                                      <Ionicons name={rc.icon as any} size={11} color={rc.color} />
                                    )}
                                    <Text style={[styles.roleOptionText, { color: rc.color }]}>
                                      {rc.label}
                                    </Text>
                                    {isActive && (
                                      <Ionicons name="checkmark" size={11} color={rc.color} />
                                    )}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* ── Leave Expedition (non-owners) ───────── */}
                {currentUserRole && currentUserRole !== 'owner' && (
                  <TouchableOpacity
                    style={[styles.leaveBtn, leaving && { opacity: 0.5 }]}
                    onPress={handleLeave}
                    disabled={leaving}
                    activeOpacity={0.7}
                  >
                    {leaving ? (
                      <ActivityIndicator size="small" color={TACTICAL.danger} />
                    ) : (
                      <Ionicons name="exit-outline" size={14} color={TACTICAL.danger} />
                    )}
                    <Text style={styles.leaveBtnText}>
                      {leaving ? 'LEAVING...' : 'LEAVE EXPEDITION'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* ── Invite Section (Owner Only) ─────────── */}
                {isOwner && (
                  <View style={styles.inviteSection}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="link-outline" size={14} color={TACTICAL.amber} />
                      <Text style={styles.sectionTitle}>INVITE CREW</Text>
                    </View>
                    <Text style={styles.sectionDesc}>
                      Generate an invite code to share with your crew. Codes expire in 24 hours with up to 20 uses. Max 10 active invites.
                    </Text>

                    {/* Active Invites List */}
                    {existingInvites.length > 0 && !activeInvite && (
                      <View style={styles.existingInvitesWrap}>
                        <Text style={styles.existingInvitesLabel}>
                          ACTIVE INVITES ({existingInvites.filter(i => i.is_active !== false).length})
                        </Text>
                        {existingInvites.map((inv) => {
                          const isExpired = inv.is_expired;
                          const isMaxed = inv.is_maxed;
                          const isUsable = inv.is_active !== false && !isExpired && !isMaxed;
                          const isCopied = inviteCopied === inv.invite_code;
                          const isRevoking = revokingInviteId === inv.id;
                          return (
                            <View
                              key={inv.id}
                              style={[
                                styles.existingInviteRow,
                                !isUsable && { opacity: 0.5 },
                              ]}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={styles.existingInviteCode}>{inv.invite_code}</Text>
                                <View style={styles.existingInviteMeta}>
                                  <Text style={styles.existingInviteMetaText}>
                                    {formatExpiryTime(inv.expires_at)}
                                  </Text>
                                  <Text style={styles.existingInviteMetaText}>
                                    {inv.remaining_uses != null
                                      ? `${inv.remaining_uses} uses left`
                                      : `${inv.used_count} used`}
                                  </Text>
                                </View>
                              </View>
                              {isUsable && (
                                <View style={styles.inviteActions}>
                                  <TouchableOpacity
                                    style={[styles.miniCopyBtn, isCopied && styles.miniCopyBtnCopied]}
                                    onPress={() => handleCopyCode(inv.invite_code)}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons
                                      name={isCopied ? 'checkmark' : 'copy-outline'}
                                      size={12}
                                      color={isCopied ? '#66BB6A' : TACTICAL.text}
                                    />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.miniRevokeBtn, isRevoking && { opacity: 0.5 }]}
                                    onPress={() => handleRevokeInvite(inv.id)}
                                    disabled={isRevoking}
                                    activeOpacity={0.7}
                                  >
                                    {isRevoking ? (
                                      <ActivityIndicator size={10} color={TACTICAL.danger} />
                                    ) : (
                                      <Ionicons name="close-outline" size={13} color={TACTICAL.danger} />
                                    )}
                                  </TouchableOpacity>
                                </View>
                              )}
                              {!isUsable && (
                                <View style={styles.expiredBadge}>
                                  <Text style={styles.expiredBadgeText}>
                                    {isExpired ? 'EXPIRED' : 'MAXED'}
                                  </Text>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Generate Button */}
                    {!activeInvite && (
                      <TouchableOpacity
                        style={[styles.generateBtn, generatingInvite && { opacity: 0.6 }]}
                        onPress={handleGenerateInvite}
                        disabled={generatingInvite}
                        activeOpacity={0.85}
                      >
                        {generatingInvite ? (
                          <ActivityIndicator size="small" color="#0B0F12" />
                        ) : (
                          <Ionicons name="key-outline" size={15} color="#0B0F12" />
                        )}
                        <Text style={styles.generateBtnText}>
                          {generatingInvite ? 'GENERATING...' : 'GENERATE NEW CODE'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Active Invite Card */}
                    {activeInvite && (
                      <View style={styles.inviteCard}>
                        <Text style={styles.inviteLabel}>INVITE CODE</Text>
                        <View style={styles.codeRow}>
                          <Text style={styles.codeText}>{activeInvite.invite_code}</Text>
                          <TouchableOpacity
                            style={[
                              styles.copyBtn,
                              inviteCopied === activeInvite.invite_code && styles.copyBtnCopied,
                            ]}
                            onPress={() => handleCopyCode(activeInvite.invite_code)}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name={inviteCopied === activeInvite.invite_code ? 'checkmark-outline' : 'copy-outline'}
                              size={14}
                              color={inviteCopied === activeInvite.invite_code ? '#66BB6A' : TACTICAL.text}
                            />
                            <Text style={[
                              styles.copyBtnText,
                              inviteCopied === activeInvite.invite_code && { color: '#66BB6A' },
                            ]}>
                              {inviteCopied === activeInvite.invite_code ? 'COPIED' : 'COPY'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* Invite Meta */}
                        <View style={styles.inviteMeta}>
                          <View style={styles.inviteMetaRow}>
                            <Ionicons name="time-outline" size={11} color={TACTICAL.textMuted} />
                            <Text style={styles.inviteMetaText}>
                              {formatExpiryTime(activeInvite.expires_at)}
                            </Text>
                          </View>
                          <View style={styles.inviteMetaRow}>
                            <Ionicons name="people-outline" size={11} color={TACTICAL.textMuted} />
                            <Text style={styles.inviteMetaText}>
                              {activeInvite.max_uses != null
                                ? `${activeInvite.max_uses - activeInvite.used_count} of ${activeInvite.max_uses} uses remaining`
                                : 'Unlimited uses'}
                            </Text>
                          </View>
                        </View>

                        {/* Dismiss / Revoke */}
                        <View style={styles.inviteCardActions}>
                          <TouchableOpacity
                            style={styles.generateNewBtn}
                            onPress={() => {
                              setActiveInvite(null);
                              setInviteCopied(null);
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="checkmark-outline" size={12} color={TACTICAL.textMuted} />
                            <Text style={styles.generateNewBtnText}>DISMISS</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.revokeBtn}
                            onPress={() => handleRevokeInvite(activeInvite.id)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="trash-outline" size={12} color={TACTICAL.danger} />
                            <Text style={styles.revokeBtnText}>REVOKE</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}

            {/* ═══════════════════════════════════════════════ */}
            {/* ── JOIN TAB ────────────────────────────────── */}
            {/* ═══════════════════════════════════════════════ */}
            {activeTab === 'join' && (
              <View style={styles.joinSection}>
                <View style={styles.joinIconWrap}>
                  <Ionicons name="ticket-outline" size={32} color={TACTICAL.amber} />
                </View>
                <Text style={styles.joinTitle}>JOIN EXPEDITION</Text>
                <Text style={styles.joinDesc}>
                  Enter an invite code shared by the expedition owner to join as a crew member.
                </Text>

                {/* Code Input */}
                <Text style={styles.fieldLabel}>INVITE CODE</Text>
                <TextInput
                  style={[styles.input, joinError ? styles.inputError : null]}
                  value={joinCode}
                  onChangeText={(v) => {
                    const upper = v.toUpperCase();
                    setJoinCode(upper);
                    setJoinError(null);
                    setJoinSuccess(false);
                    setJoinResult(null);
                    // Auto-check when code is long enough
                    if (upper.trim().length >= 8) {
                      handleCheckCode(upper);
                    } else {
                      setInviteInfo(null);
                    }
                  }}
                  placeholder="e.g. A1B2C3D4"
                  placeholderTextColor={TACTICAL.textMuted}
                  autoCapitalize="characters"
                  maxLength={12}
                />

                {/* Pre-validation info card */}
                {checkingCode && (
                  <View style={styles.inviteInfoCard}>
                    <ActivityIndicator size={10} color={TACTICAL.amber} />
                    <Text style={styles.inviteInfoText}>Checking code...</Text>
                  </View>
                )}
                {inviteInfo && !checkingCode && !joinSuccess && (
                  <View style={[
                    styles.inviteInfoCard,
                    !inviteInfo.is_valid && styles.inviteInfoCardInvalid,
                    inviteInfo.already_member && styles.inviteInfoCardWarn,
                  ]}>
                    {inviteInfo.is_valid && !inviteInfo.already_member && (
                      <Ionicons name="checkmark-circle-outline" size={14} color="#66BB6A" />
                    )}
                    {inviteInfo.already_member && (
                      <Ionicons name="information-circle-outline" size={14} color={TACTICAL.amber} />
                    )}
                    {!inviteInfo.is_valid && !inviteInfo.already_member && (
                      <Ionicons name="close-circle-outline" size={14} color={TACTICAL.danger} />
                    )}
                    <View style={{ flex: 1 }}>
                      {inviteInfo.expedition_title && (
                        <Text style={styles.inviteInfoTitle}>{inviteInfo.expedition_title}</Text>
                      )}
                      {inviteInfo.already_member && (
                        <Text style={styles.inviteInfoText}>You are already a member</Text>
                      )}
                      {!inviteInfo.is_valid && inviteInfo.is_expired && (
                        <Text style={[styles.inviteInfoText, { color: TACTICAL.danger }]}>Code has expired</Text>
                      )}
                      {!inviteInfo.is_valid && inviteInfo.is_maxed && (
                        <Text style={[styles.inviteInfoText, { color: TACTICAL.danger }]}>Code has reached max uses</Text>
                      )}
                      {inviteInfo.is_valid && !inviteInfo.already_member && (
                        <>
                          <Text style={[styles.inviteInfoText, { color: '#66BB6A' }]}>Valid code</Text>
                          <View style={styles.inviteInfoMeta}>
                            {inviteInfo.remaining_uses != null && (
                              <Text style={styles.inviteInfoMetaText}>
                                {inviteInfo.remaining_uses} uses left
                              </Text>
                            )}
                            <Text style={styles.inviteInfoMetaText}>
                              {formatExpiryTime(inviteInfo.expires_at)}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                  </View>
                )}

                {joinError && (
                  <View style={styles.joinErrorRow}>
                    <Ionicons name="alert-circle-outline" size={12} color={TACTICAL.danger} />
                    <Text style={styles.joinErrorText}>{joinError}</Text>
                  </View>
                )}
                {joinSuccess && (
                  <View style={styles.joinSuccessRow}>
                    <Ionicons name="checkmark-circle-outline" size={12} color="#66BB6A" />
                    <Text style={styles.joinSuccessText}>
                      {joinResult?.already_member
                        ? joinResult.message || 'You are already a member of this expedition.'
                        : `Successfully joined${joinResult?.expedition_title ? ` "${joinResult.expedition_title}"` : ''}!`}
                    </Text>
                  </View>
                )}
                {joinSuccess && joinResult && !joinResult.already_member && (
                  <View style={styles.joinResultMeta}>
                    {joinResult.invite_expires_at && (
                      <View style={styles.inviteMetaRow}>
                        <Ionicons name="time-outline" size={10} color={TACTICAL.textMuted} />
                        <Text style={styles.inviteMetaText}>
                          Code {formatExpiryTime(joinResult.invite_expires_at)}
                        </Text>
                      </View>
                    )}
                    {joinResult.invite_remaining_uses != null && (
                      <View style={styles.inviteMetaRow}>
                        <Ionicons name="people-outline" size={10} color={TACTICAL.textMuted} />
                        <Text style={styles.inviteMetaText}>
                          {joinResult.invite_remaining_uses} uses remaining on this code
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Join Button */}
                <TouchableOpacity
                  style={[
                    styles.joinBtn,
                    (joining || !joinCode.trim()) && { opacity: 0.5 },
                  ]}
                  onPress={handleJoin}
                  disabled={joining || !joinCode.trim()}
                  activeOpacity={0.85}
                >
                  {joining ? (
                    <ActivityIndicator size="small" color="#0B0F12" />
                  ) : (
                    <Ionicons name="enter-outline" size={15} color="#0B0F12" />
                  )}
                  <Text style={styles.joinBtnText}>
                    {joining ? 'JOINING...' : 'JOIN EXPEDITION'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Bottom spacing */}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    minHeight: 300,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginTop: 1,
    maxWidth: 200,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 6,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  tabActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  tabText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
  },
  tabTextActive: {
    color: TACTICAL.amber,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: Platform.OS === 'web' ? 24 : 44,
  },

  // Error Banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.2)',
    marginBottom: 12,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 11,
    color: TACTICAL.danger,
    fontWeight: '600',
  },

  // Loading
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  emptySubtitle: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 240,
  },

  // Members List
  membersList: {
    gap: 0,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.3)',
  },

  // Avatar
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Member Info
  memberInfo: {
    flex: 1,
    gap: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  youBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  youBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  memberEmail: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
  },
  memberJoined: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    marginTop: 1,
  },

  // Role Badge
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  roleBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  // Role Picker
  rolePickerRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    paddingLeft: 50,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.3)',
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  roleOptionText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Leave Button
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.3)',
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
  },
  leaveBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 1.5,
  },

  // ── Invite Section ─────────────────────────────────────────
  inviteSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.3)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  sectionDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
    marginBottom: 14,
  },

  // Existing Invites
  existingInvitesWrap: {
    marginBottom: 14,
  },
  existingInvitesLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
  },
  existingInviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginBottom: 4,
  },
  existingInviteCode: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
    fontFamily: 'Courier',
  },
  existingInviteMeta: {
    gap: 1,
    marginTop: 2,
  },
  existingInviteMetaText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 4,
  },
  miniCopyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  miniCopyBtnCopied: {
    borderColor: '#66BB6A',
    backgroundColor: 'rgba(102, 187, 106, 0.08)',
  },
  miniRevokeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.2)',
  },
  expiredBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(138, 138, 133, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(138, 138, 133, 0.2)',
  },
  expiredBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // Generate Button
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
  },
  generateBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },

  // Invite Card
  inviteCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    padding: 16,
  },
  inviteLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  codeText: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 4,
    fontFamily: 'Courier',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  copyBtnCopied: {
    borderColor: '#66BB6A',
    backgroundColor: 'rgba(102, 187, 106, 0.08)',
  },
  copyBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
  },

  // Invite Meta
  inviteMeta: {
    gap: 6,
    marginBottom: 12,
  },
  inviteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inviteMetaText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },

  // Invite Card Actions
  inviteCardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  generateNewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  generateNewBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  revokeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.3)',
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
  },
  revokeBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.danger,
    letterSpacing: 1,
  },

  // ── Join Section ───────────────────────────────────────────
  joinSection: {
    alignItems: 'center',
    paddingTop: 10,
  },
  joinIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    marginBottom: 14,
  },
  joinTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
    marginBottom: 6,
  },
  joinDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 280,
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
    alignSelf: 'flex-start',
    width: '100%',
  },
  input: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    padding: 14,
    color: TACTICAL.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 3,
    fontFamily: 'Courier',
    textAlign: 'center',
    marginBottom: 6,
  },
  inputError: {
    borderColor: TACTICAL.danger || '#E53935',
  },

  // Invite Info Card (pre-validation)
  inviteInfoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(102, 187, 106, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.2)',
    marginBottom: 8,
    width: '100%',
  },
  inviteInfoCardInvalid: {
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
    borderColor: 'rgba(229, 57, 53, 0.2)',
  },
  inviteInfoCardWarn: {
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderColor: 'rgba(196, 138, 44, 0.2)',
  },
  inviteInfoTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  inviteInfoText: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  inviteInfoMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 3,
  },
  inviteInfoMetaText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },

  joinErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    marginBottom: 8,
    width: '100%',
  },
  joinErrorText: {
    fontSize: 10,
    color: TACTICAL.danger,
    fontWeight: '600',
    flex: 1,
  },
  joinSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    marginBottom: 4,
    width: '100%',
  },
  joinSuccessText: {
    fontSize: 10,
    color: '#66BB6A',
    fontWeight: '600',
    flex: 1,
  },
  joinResultMeta: {
    gap: 4,
    marginBottom: 8,
    width: '100%',
    paddingLeft: 4,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    marginTop: 10,
  },
  joinBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },
});



