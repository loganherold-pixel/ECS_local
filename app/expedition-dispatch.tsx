import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import { NON_OBSTRUCTIVE_REFRESH_CONTROL_PROPS } from '../lib/nonObstructiveRefreshControl';
import { useApp } from '../context/AppContext';
import TopoBackground from '../components/TopoBackground';
import { dispatchStore } from '../lib/dispatchStore';
import { dispatchQueue } from '../lib/dispatchQueueStore';
import type { FlushResult } from '../lib/dispatchQueueStore';
import { supabase } from '../lib/supabase';
import type {
  DispatchEvent,
  ExpeditionMember,
  ComposeEventForm,
  ExpeditionMemberRole,
} from '../lib/dispatchTypes';

import { EVENT_TYPE_META } from '../lib/dispatchTypes';
import ComposeEventModal from '../components/dispatch/ComposeEventModal';
import MembersPanel from '../components/dispatch/MembersPanel';
import DispatchEventCard from '../components/dispatch/DispatchEventCard';
import DispatchQueueBadge from '../components/dispatch/DispatchQueueBadge';
import DispatchQueueModal from '../components/dispatch/DispatchQueueModal';
import { expeditionStore } from '../lib/expeditionCommandStore';
import type { EcsExpedition } from '../lib/expeditionTypes';
import {
  getDispatchRolloutDisabledCopy,
  isDispatchFeatureEnabled,
  resolveDispatchRolloutConfig,
} from '../lib/dispatchRolloutConfig';

const PAGE_SIZE = 25;

export default function ExpeditionDispatchScreen() {
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const router = useRouter();

  const { user, isOnline, showToast } = useApp();
  const params = useLocalSearchParams<{ id?: string }>();
  const expeditionId = params.id || '';

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expedition, setExpedition] = useState<EcsExpedition | null>(null);
  const [events, setEvents] = useState<DispatchEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [member, setMember] = useState<ExpeditionMember | null>(null);
  const [composeVisible, setComposeVisible] = useState(false);
  const [membersVisible, setMembersVisible] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Queue count for inline display
  const [queueCount, setQueueCount] = useState(0);

  // Realtime subscription ref
  const realtimeRef = useRef<any>(null);

  const isArchived = expedition?.status === 'archived' || expedition?.status === 'completed';
  const isActive = expedition?.status === 'active';
  const dispatchRollout = useMemo(() => resolveDispatchRolloutConfig(), []);
  const externalDispatchIntegrationEnabled = isDispatchFeatureEnabled(dispatchRollout, 'externalDispatchIntegration');
  const canPost = externalDispatchIntegrationEnabled && isActive && member?.role !== 'viewer';

  // ── Track queue count ──────────────────────────────────────
  useEffect(() => {
    if (!externalDispatchIntegrationEnabled || !expeditionId) return;

    // Initial count
    setQueueCount(dispatchQueue.countByExpedition(expeditionId));

    const unsub = dispatchQueue.onChange((queue) => {
      const count = queue.filter(i => i.expedition_id === expeditionId).length;
      setQueueCount(count);
    });

    return () => { unsub(); };
  }, [expeditionId, externalDispatchIntegrationEnabled]);

  // ── Auto-flush on reconnect ────────────────────────────────
  useEffect(() => {
    if (!externalDispatchIntegrationEnabled) return;

    // Start auto-flush monitoring
    dispatchQueue.startAutoFlush();

    // Listen for flush results to insert created events into feed
    const unsubFlush = dispatchQueue.onFlush((result: FlushResult) => {
      if (result.created.length > 0) {
        // Insert newly created events into the feed
        setEvents(prev => {
          const newEvents = result.created.filter(
            e => e.expedition_id === expeditionId && !prev.some(existing => existing.id === e.id)
          );
          if (newEvents.length === 0) return prev;

          if (sortOrder === 'newest') {
            return [...newEvents, ...prev];
          }
          return [...prev, ...newEvents];
        });
        setTotalEvents(prev => prev + result.created.filter(e => e.expedition_id === expeditionId).length);

        if (result.sent > 0) {
          showToast(`Sent ${result.sent} queued dispatch event${result.sent !== 1 ? 's' : ''}`);
        }
      }
      if (result.errors.length > 0 && result.sent === 0) {
        showToast(`Failed to send ${result.errors.length} queued event${result.errors.length !== 1 ? 's' : ''}`);
      }
    });

    return () => {
      unsubFlush();
      // Don't stop auto-flush here — it's managed globally
    };
  }, [expeditionId, externalDispatchIntegrationEnabled, sortOrder, showToast]);
  const fetchExpedition = useCallback(async () => {
    if (!expeditionId) return;
    try {
      const exp = await expeditionStore.getById(expeditionId);
      if (mountedRef.current) setExpedition(exp);
    } catch (err) {
      console.warn('[ExpeditionDispatch] fetchExpedition error:', err);
    }
  }, [expeditionId]);

  const ensureMembership = useCallback(async () => {
    if (!externalDispatchIntegrationEnabled || !expeditionId || !user) return;
    try {
      const { data } = await dispatchStore.ensureMember(expeditionId, 'owner');
      if (mountedRef.current) setMember(data);
    } catch (err) {
      console.warn('[ExpeditionDispatch] ensureMembership error:', err);
    }
  }, [expeditionId, externalDispatchIntegrationEnabled, user]);



  // ── Fetch events ───────────────────────────────────────────
  const fetchEvents = useCallback(async (pageNum: number = 0, append: boolean = false) => {
    if (!expeditionId) return;
    if (!externalDispatchIntegrationEnabled) {
      setEvents([]);
      setTotalEvents(0);
      setHasMore(false);
      setPage(0);
      setError(null);
      return;
    }
    try {
      const { data, error: fetchError } = await dispatchStore.listEvents(expeditionId, pageNum, sortOrder);
      if (!mountedRef.current) return;
      if (fetchError) {
        setError(fetchError);
        return;
      }
      if (data) {
        if (append) {
          setEvents(prev => [...prev, ...data.events]);
        } else {
          setEvents(data.events);
        }
        setTotalEvents(data.total);
        setHasMore(data.has_more);
        setPage(pageNum);
        setError(null);
      }
    } catch (err: any) {
      console.warn('[ExpeditionDispatch] fetchEvents error:', err);
      if (mountedRef.current) setError(err.message || 'Failed to load events');
    }
  }, [expeditionId, externalDispatchIntegrationEnabled, sortOrder]);

  // ── Initial load ───────────────────────────────────────────
  const initialLoad = useCallback(async () => {
    if (mountedRef.current) setLoading(true);
    await Promise.all([
      fetchExpedition(),
      ensureMembership(),
      fetchEvents(0),
    ]);
    if (mountedRef.current) setLoading(false);
  }, [fetchExpedition, ensureMembership, fetchEvents]);

  useFocusEffect(useCallback(() => {
    initialLoad();
  }, [initialLoad]));

  // ── Realtime subscription ──────────────────────────────────
  useFocusEffect(useCallback(() => {
    if (!externalDispatchIntegrationEnabled || !expeditionId) return;

    const channel = supabase
      .channel(`dispatch-${expeditionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: '*',
          table: 'dispatch_events',
          filter: `expedition_id=eq.${expeditionId}`,
        },
        (payload: any) => {
          if (!mountedRef.current) return;
          const newEvent = payload.new as DispatchEvent;
          if (newEvent && sortOrder === 'newest') {
            setEvents(prev => {
              if (prev.some(e => e.id === newEvent.id)) return prev;
              return [newEvent, ...prev];
            });
            setTotalEvents(prev => prev + 1);
          } else if (newEvent && sortOrder === 'oldest') {
            setTotalEvents(prev => prev + 1);
            setHasMore(true);
          }
        }
      )
      .subscribe();

    realtimeRef.current = channel;

    return () => {
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, [expeditionId, externalDispatchIntegrationEnabled, sortOrder]));

  // ── Pull to refresh ────────────────────────────────────────
  const handleRefresh = async () => {
    if (mountedRef.current) setRefreshing(true);
    await fetchEvents(0);
    if (mountedRef.current) setRefreshing(false);
  };

  // ── Load more ──────────────────────────────────────────────
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    if (mountedRef.current) setLoadingMore(true);
    await fetchEvents(page + 1, true);
    if (mountedRef.current) setLoadingMore(false);
  };



  // ── Sort toggle ────────────────────────────────────────────
  const handleToggleSort = () => {
    const newSort = sortOrder === 'newest' ? 'oldest' : 'newest';
    setSortOrder(newSort);
  };

  // Re-fetch when sort changes
  useEffect(() => {
    if (!loading) {
      fetchEvents(0);
    }
  }, [sortOrder, fetchEvents, loading]);

  // ── Compose submit (online or offline queue) ───────────────
  const handleComposeSubmit = async (form: ComposeEventForm) => {
    if (!externalDispatchIntegrationEnabled) {
      showToast('Expedition Dispatch feed is unavailable for internal beta.');
      throw new Error('External Dispatch integration is disabled for internal beta.');
    }

    if (!isOnline) {
      // OFFLINE: Queue the event for later
      dispatchQueue.enqueue(expeditionId, form);
      setComposeVisible(false);
      showToast('Event queued — will send when online');
      return;
    }

    // ONLINE: Send immediately
    const { data, error: createError } = await dispatchStore.createEvent(expeditionId, form);
    if (createError) {
      showToast(createError);
      throw new Error(createError);
    }
    if (data) {
      setEvents(prev => {
        if (prev.some(e => e.id === data.id)) return prev;
        if (sortOrder === 'newest') return [data, ...prev];
        return [...prev, data];
      });
      setTotalEvents(prev => prev + 1);
      setComposeVisible(false);
      showToast('Dispatch event posted');
    }
  };

  // ── Handle flush results from queue modal ──────────────────
  const handleQueueFlushed = (result: FlushResult) => {
    if (result.created.length > 0) {
      // Insert flushed events into the feed
      setEvents(prev => {
        const newEvents = result.created.filter(
          e => e.expedition_id === expeditionId && !prev.some(existing => existing.id === e.id)
        );
        if (newEvents.length === 0) return prev;
        if (sortOrder === 'newest') return [...newEvents, ...prev];
        return [...prev, ...newEvents];
      });
      setTotalEvents(prev => prev + result.created.filter(e => e.expedition_id === expeditionId).length);
    }
  };

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <TopoBackground>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TACTICAL.accent} />
          <Text style={styles.loadingText}>LOADING DISPATCH FEED...</Text>
        </View>
      </TopoBackground>
    );
  }

  if (!expedition) {
    return (
      <TopoBackground>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={TACTICAL.danger} />
          <Text style={styles.errorText}>EXPEDITION NOT FOUND</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryBtnText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      </TopoBackground>
    );
  }

  return (
    <TopoBackground>
      <View style={styles.container}>
        {/* ── Header ──────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={TACTICAL.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerBrand}>DISPATCH FEED</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{expedition.title || 'Expedition'}</Text>
          </View>
          <View style={styles.headerRight}>
            {/* Queue Badge */}
            {externalDispatchIntegrationEnabled ? (
              <>
                <DispatchQueueBadge
                  expeditionId={expeditionId}
                  onPress={() => setQueueVisible(true)}
                />
                <TouchableOpacity
                  onPress={() => setMembersVisible(true)}
                  style={styles.crewBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="people-outline" size={17} color={TACTICAL.text} />
                </TouchableOpacity>
              </>
            ) : null}
            <View style={[styles.statusDot, { backgroundColor: isActive ? '#4CAF50' : isArchived ? TACTICAL.textMuted : TACTICAL.amber }]} />
            <Text style={[styles.statusLabel, { color: isActive ? '#4CAF50' : isArchived ? TACTICAL.textMuted : TACTICAL.amber }]}>
              {expedition.status.toUpperCase()}
            </Text>
          </View>
        </View>



        {/* ── Archived Banner ─────────────────────────────── */}
        {isArchived && (
          <View style={styles.archivedBanner}>
            <Ionicons name="lock-closed-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={styles.archivedBannerText}>ARCHIVED — READ ONLY</Text>
          </View>
        )}

        {!externalDispatchIntegrationEnabled && (
          <View style={styles.rolloutBanner}>
            <Ionicons name="shield-checkmark-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.rolloutBannerText}>
              Internal preview only. {getDispatchRolloutDisabledCopy('externalDispatchIntegration')}
            </Text>
          </View>
        )}

        {/* ── Feed Controls ───────────────────────────────── */}
        <View style={styles.controls}>
          <View style={styles.controlsLeft}>
            <Text style={styles.eventCount}>
              {totalEvents} EVENT{totalEvents !== 1 ? 'S' : ''}
              {queueCount > 0 ? ` + ${queueCount} QUEUED` : ''}
            </Text>
            {!isOnline && (
              <View style={styles.offlineChip}>
                <View style={[styles.offlineDot, { backgroundColor: '#E53935' }]} />
                <Text style={styles.offlineText}>OFFLINE</Text>
              </View>
            )}
          </View>
          <View style={styles.controlsRight}>
            <TouchableOpacity style={styles.sortBtn} onPress={handleToggleSort} activeOpacity={0.7}>
              <Ionicons
                name={sortOrder === 'newest' ? 'arrow-down-outline' : 'arrow-up-outline'}
                size={14}
                color={TACTICAL.textMuted}
              />
              <Text style={styles.sortBtnText}>
                {sortOrder === 'newest' ? 'NEWEST' : 'OLDEST'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Event Feed ──────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.feedContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              {...NON_OBSTRUCTIVE_REFRESH_CONTROL_PROPS}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
        >
          {error && (
            <View style={styles.errorCard}>
              <Ionicons name="warning-outline" size={16} color={TACTICAL.danger} />
              <Text style={styles.errorCardText}>{error}</Text>
              <TouchableOpacity onPress={() => fetchEvents(0)}>
                <Text style={styles.retryLink}>RETRY</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Queued Events Banner ──────────────────────── */}
          {queueCount > 0 && (
            <TouchableOpacity
              style={styles.queueBanner}
              onPress={() => setQueueVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.queueBannerLeft}>
                <Ionicons name="cloud-upload-outline" size={14} color={TACTICAL.amber} />
                <View>
                  <Text style={styles.queueBannerTitle}>
                    {queueCount} QUEUED EVENT{queueCount !== 1 ? 'S' : ''}
                  </Text>
                  <Text style={styles.queueBannerSubtitle}>
                    {isOnline ? 'Tap to send now' : 'Will send when online'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          )}

          {events.length === 0 && !error && queueCount === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="radio-outline" size={40} color={TACTICAL.textMuted} />
              <Text style={styles.emptyTitle}>
                {externalDispatchIntegrationEnabled ? 'NO DISPATCH EVENTS' : 'EXPEDITION DISPATCH UNAVAILABLE'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {!externalDispatchIntegrationEnabled
                  ? 'External Dispatch feed sync is disabled for internal beta. Use the Dispatch tab for local Recovery/CAD reports.'
                  : canPost
                  ? 'Post the first event to start the dispatch feed.'
                  : 'No events have been posted yet.'}
              </Text>
            </View>
          )}

          {events.map((event) => (
            <DispatchEventCard key={event.id} event={event} />
          ))}

          {/* Load Earlier Button */}
          {hasMore && (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={handleLoadMore}
              disabled={loadingMore}
              activeOpacity={0.7}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={TACTICAL.amber} />
              ) : (
                <>
                  <Ionicons name="time-outline" size={14} color={TACTICAL.amber} />
                  <Text style={styles.loadMoreText}>LOAD EARLIER</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Bottom spacing */}
          <View style={{ height: 120 }} />
        </ScrollView>

        {/* ── Compose FAB ─────────────────────────────────── */}
        {/* Allow composing when offline too — events will be queued */}
        {externalDispatchIntegrationEnabled && (canPost || (!isOnline && isActive && member?.role !== 'viewer')) && (
          <TouchableOpacity
            style={[
              styles.composeFab,
              !isOnline && styles.composeFabOffline,
            ]}
            onPress={() => setComposeVisible(true)}
            activeOpacity={0.85}
          >
            {!isOnline ? (
              <Ionicons name="cloud-upload-outline" size={20} color="#0B0F12" />
            ) : (
              <Ionicons name="add" size={22} color="#0B0F12" />
            )}
          </TouchableOpacity>
        )}

        {/* ── Members Panel Modal ─────────────────────────── */}
        <MembersPanel
          visible={membersVisible}
          onClose={() => setMembersVisible(false)}
          expeditionId={expeditionId}
          currentUserRole={(member?.role as ExpeditionMemberRole) || null}
          currentUserId={user?.id || null}
          onMembershipChanged={() => ensureMembership()}
        />

        {/* ── Queue Viewer Modal ──────────────────────────── */}
        <DispatchQueueModal
          visible={queueVisible}
          onClose={() => setQueueVisible(false)}
          expeditionId={expeditionId}
          onFlushed={handleQueueFlushed}
        />

        <ComposeEventModal
          visible={composeVisible}
          onClose={() => setComposeVisible(false)}
          onSubmit={handleComposeSubmit}
          isArchived={isArchived}
          isOffline={!isOnline}
        />
      </View>
    </TopoBackground>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { fontSize: 11, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 2 },
  errorText: { fontSize: 14, fontWeight: '800', color: TACTICAL.danger, letterSpacing: 0.5 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: TACTICAL.accent, borderRadius: 10, marginTop: 8 },
  retryBtnText: { fontSize: 11, fontWeight: '800', color: '#0B0F12', letterSpacing: 1 },
  crewBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1, borderColor: TACTICAL.border,
    marginRight: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  headerCenter: { flex: 1 },
  headerBrand: { fontSize: 9, fontWeight: '600', color: TACTICAL.amber, letterSpacing: 2.5 },
  headerTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.3, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },


  // Archived Banner
  archivedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(138, 138, 133, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(138, 138, 133, 0.2)',
    marginBottom: 6,
  },
  archivedBannerText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  rolloutBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.24)',
  },
  rolloutBannerText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },

  // Controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  controlsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  controlsRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventCount: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    fontFamily: 'Courier',
  },
  offlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(229, 57, 53, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.2)',
  },
  offlineDot: { width: 5, height: 5, borderRadius: 3 },
  offlineText: { fontSize: 8, fontWeight: '800', color: '#E53935', letterSpacing: 1 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  sortBtnText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // Feed
  feedContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },

  // Error card
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.2)',
    marginBottom: 10,
  },
  errorCardText: { flex: 1, fontSize: 11, color: TACTICAL.danger, fontWeight: '600' },
  retryLink: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1 },

  // Queue banner
  queueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    marginBottom: 10,
  },
  queueBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  queueBannerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  queueBannerSubtitle: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 1,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  emptySubtitle: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 260,
  },

  // Load more
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginTop: 4,
  },
  loadMoreText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  // Compose FAB
  composeFab: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 24 : 100,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  composeFabOffline: {
    backgroundColor: '#B07A1C',
  },
});




