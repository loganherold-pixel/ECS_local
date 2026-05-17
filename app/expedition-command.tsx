import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';

import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Platform, ActivityIndicator, Modal, TextInput, Animated,
} from 'react-native';

import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';
import TopoBackground from '../components/TopoBackground';

import {
  expeditionStore,
  checklistStore,
  fieldLogStore,
  routeCommandStore,
  waypointCommandStore,
} from '../lib/expeditionCommandStore';

import {
  type EcsChecklistItem,
  type EcsExpedition,
  type EcsFieldLog,
  type EcsFieldLogType,
  type EcsRoute,
  type EcsWaypoint,
  TERRAIN_OPTIONS,
  FIELD_LOG_TYPE_META,
  computeReadiness,
} from '../lib/expeditionTypes';

import ExportDataModal from '../components/expedition/ExportDataModal';

import {
  generateCompletionSummary,
  type CompletionSummary,
} from '../lib/completionSummary';

import CompletionSummaryCard from '../components/CompletionSummaryCard';
import ExpeditionStatePill from '../components/ExpeditionStatePill';
import LatestMomentBanner from '../components/narrative/LatestMomentBanner';

import { narrativeEngine } from '../lib/narrativeEngine';

function logExpeditionCommandDev(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}




function ReadinessRing({ score }: { score: number }) {
  const color = score >= 80 ? '#4CAF50' : score >= 50 ? TACTICAL.amber : '#E53935';
  return (
    <View style={styles.ringContainer}>
      <View style={[styles.ringOuter, { borderColor: `${color}30` }]}>
        <View style={[styles.ringInner, { borderColor: color }]}>
          <Text style={[styles.ringScore, { color }]}>{score}</Text>
          <Text style={styles.ringLabel}>READY</Text>
        </View>
      </View>
    </View>
  );
}

export default function ExpeditionCommandScreen() {
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const router = useRouter();
  const { user, isOnline, showToast } = useApp();

  const params = useLocalSearchParams<{ id?: string }>();
  const expeditionId = params.id || '';


  const [loading, setLoading] = useState(true);
  const [expedition, setExpedition] = useState<EcsExpedition | null>(null);
  const [checklist, setChecklist] = useState<EcsChecklistItem[]>([]);
  const [fieldLogs, setFieldLogs] = useState<EcsFieldLog[]>([]);
  const [routes, setRoutes] = useState<EcsRoute[]>([]);
  const [waypoints, setWaypoints] = useState<EcsWaypoint[]>([]);

  // Quick log modal
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [logType, setLogType] = useState<EcsFieldLogType>('note');
  const [logTitle, setLogTitle] = useState('');
  const [logBody, setLogBody] = useState('');
  const [logSaving, setLogSaving] = useState(false);

  // Export modal
  const [exportModalVisible, setExportModalVisible] = useState(false);

  // Complete expedition

  const [completing, setCompleting] = useState(false);
  // Undo toast state
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionLogIdRef = useRef<string | null>(null);
  const undoProgressAnim = useRef(new Animated.Value(1)).current;
  const previousStartAtRef = useRef<string | null>(null);
  const completionSummaryRef = useRef<CompletionSummary | null>(null);

  // Completion summary display (for already-completed expeditions or after undo expires)
  const [displayedSummary, setDisplayedSummary] = useState<CompletionSummary | null>(null);

  // ── Modal State Guards ──────────────────────────────────
  // Prevents duplicate modals and double-execution of completion flow.
  const executionGuardRef = useRef(false);       // Prevents double-execution of executeCompletion
  const confirmDismissedRef = useRef(false);     // Prevents confirm modal from re-opening after dismiss
  const errorDismissedRef = useRef(false);       // Prevents error modal from re-opening after dismiss

  // ── Confirmation modal state (replaces Alert.alert for web compatibility) ──
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  // ── Error modal state (replaces Alert.alert for error display) ──
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorModalTitle, setErrorModalTitle] = useState('');
  const [errorModalMessage, setErrorModalMessage] = useState('');



  const fetchAll = useCallback(async () => {
    if (!user || !expeditionId) return;
    if (mountedRef.current) setLoading(true);
    try {
      const [exp, cl, logs, rts, wps] = await Promise.all([
        expeditionStore.getById(expeditionId),
        checklistStore.list(expeditionId, user.id),
        fieldLogStore.list(expeditionId, user.id),
        routeCommandStore.list(expeditionId, user.id),
        waypointCommandStore.list(expeditionId, user.id),
      ]);
      if (!mountedRef.current) return;
      setExpedition(exp);
      setChecklist(cl);
      setFieldLogs(logs);
      setRoutes(rts);
      setWaypoints(wps);
    } catch (err) {
      console.warn('[ExpeditionCommand] fetchAll error:', err);
    }
    if (mountedRef.current) setLoading(false);
  }, [user, expeditionId]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  // ── Load existing completion summary from meta if expedition is completed ──
  useEffect(() => {
    if (expedition && (expedition.status === 'completed' || expedition.status === 'archived') && expedition.meta?.completion_summary) {
      setDisplayedSummary(expedition.meta.completion_summary as CompletionSummary);
    } else {
      setDisplayedSummary(null);
    }
  }, [expedition]);



  const handleToggleChecklist = async (item: EcsChecklistItem) => {
    const newDone = !item.is_done;
    await checklistStore.toggleItem(item.id, newDone);
    if (!mountedRef.current) return;
    setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, is_done: newDone, done_at: newDone ? new Date().toISOString() : null } : i));
    if (expedition) {
      const updated = checklist.map(i => i.id === item.id ? { ...i, is_done: newDone } : i);
      const { score } = computeReadiness(updated);
      await expeditionStore.update(expedition.id, { readiness_score: score } as any);
    }
  };

  const handleQuickLog = (type: EcsFieldLogType) => {
    setLogType(type);
    setLogTitle('');
    setLogBody('');
    setLogModalVisible(true);
  };

  const handleSaveLog = async () => {
    if (!user || !expeditionId || logSaving) return;
    setLogSaving(true);
    try {
      const log = await fieldLogStore.create(user.id, {
        expedition_id: expeditionId,
        type: logType,
        title: logTitle.trim() || FIELD_LOG_TYPE_META[logType].label,
        body: logBody.trim() || undefined,
      });
      if (!mountedRef.current) return;
      if (log) setFieldLogs(prev => [log, ...prev]);
      setLogModalVisible(false);
    } catch (err) {
      console.warn('[ExpeditionCommand] handleSaveLog error:', err);
    }
    if (mountedRef.current) setLogSaving(false);
  };

  // ── Derived data ──────────────────────────────────────────
  const readiness = useMemo(() => computeReadiness(checklist), [checklist]);
  const terrain = useMemo(() => TERRAIN_OPTIONS.find(t => t.value === expedition?.terrain) || null, [expedition?.terrain]);
  const criticalItems = useMemo(() => checklist.filter(i => !i.is_done && (i.priority === 'critical' || i.priority === 'high')), [checklist]);



  // ── Cleanup undo timer on unmount ──────────────────────
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, []);

  // ── Called when the 5-second undo window expires ───────
  const handleUndoExpire = useCallback(async () => {
    if (!mountedRef.current) return;
    setUndoVisible(false);
    setCompleting(false);

    // Generate and persist the completion summary before navigating away
    const summary = completionSummaryRef.current;
    if (summary && expeditionId) {
      try {
        const existingMeta = expedition?.meta || {};
        await expeditionStore.update(expeditionId, {
          meta: { ...existingMeta, completion_summary: summary },
        } as any);
        logExpeditionCommandDev('[ExpeditionCommand] Completion summary persisted to meta');
      } catch (err) {
        console.warn('[ExpeditionCommand] Failed to persist completion summary:', err);
      }
    }

    completionLogIdRef.current = null;
    previousStartAtRef.current = null;
    completionSummaryRef.current = null;
    router.replace('/fleet' as any);

  }, [router, expeditionId, expedition]);


  // ── Undo: revert expedition back to active ────────────
  const handleUndo = useCallback(async () => {
    // 1. Cancel the navigation timer
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    undoProgressAnim.stopAnimation();

    // 2. Hide the undo toast immediately
    if (mountedRef.current) setUndoVisible(false);

    try {
      // 3. Revert expedition status back to 'active' and remove end_at
      await expeditionStore.update(expeditionId, {
        status: 'active',
        end_at: null,
      } as any);

      // 4. Delete the auto-generated completion field log
      if (completionLogIdRef.current) {
        await fieldLogStore.remove(completionLogIdRef.current);
      }

      if (!mountedRef.current) return;

      // 5. Refresh local state to reflect the revert
      const refreshedExp = await expeditionStore.getById(expeditionId);
      if (refreshedExp && mountedRef.current) {
        setExpedition(refreshedExp);
      } else if (expedition && mountedRef.current) {
        // Fallback: update local state directly
        setExpedition({ ...expedition, status: 'active', end_at: null } as EcsExpedition);
      }

      // 6. Remove the completion log from local field logs list
      if (completionLogIdRef.current) {
        const removedId = completionLogIdRef.current;
        setFieldLogs(prev => prev.filter(l => l.id !== removedId));
      }

      showToast('COMPLETION REVERSED');
    } catch (err: any) {
      console.warn('[ExpeditionCommand] handleUndo error:', err);
      if (mountedRef.current) {
        showToast('UNDO FAILED — CHECK CONNECTION');
      }
    }

    // 7. Reset refs (clear summary ref too)
    completionLogIdRef.current = null;
    previousStartAtRef.current = null;
    completionSummaryRef.current = null;
    if (mountedRef.current) setCompleting(false);
  }, [expeditionId, expedition, undoProgressAnim, showToast]);

  // ── Helper to show error modal ────────────────────────
  const showErrorModal = useCallback((title: string, message: string) => {
    setErrorModalTitle(title);
    setErrorModalMessage(message);
    setErrorModalVisible(true);
  }, []);

  // ── Open the confirmation modal (replaces Alert.alert) ──
  const handleCompleteExpedition = useCallback(() => {
    logExpeditionCommandDev('[ExpeditionCommand] handleCompleteExpedition called');

    // ── Protective validation: no silent returns ─────────
    // 1. Validate mission exists
    if (!expedition) {
      showErrorModal(
        'No Mission Found',
        'There is no expedition loaded to complete. Please go back and select a valid expedition.'
      );
      return;
    }

    // 2. Validate user session
    if (!user) {
      showErrorModal(
        'Not Authenticated',
        'You must be signed in to complete an expedition. Please sign in and try again.'
      );
      return;
    }

    // 3. If already completing, show feedback instead of silent return
    if (completing) {
      showToast('COMPLETION IN PROGRESS...');
      return;
    }

    // 4. If undo is visible, show feedback instead of silent return
    if (undoVisible) {
      showToast('UNDO WINDOW ACTIVE — WAIT OR TAP UNDO');
      return;
    }

    // 5. If mission already completed, show alert
    if (expedition.status === 'completed' || expedition.status === 'archived') {
      showErrorModal(
        'Already Completed',
        `This expedition was already marked as "${expedition.status}". No further action is needed.`
      );
      return;
    }

    // 6. Open the in-app confirmation modal
    logExpeditionCommandDev('[ExpeditionCommand] Opening confirmation modal');
    setConfirmModalVisible(true);
  }, [expedition, user, completing, undoVisible, showToast, showErrorModal]);

  // ── Execute the completion flow (called from confirmation modal) ──
  const executeCompletion = useCallback(async () => {
    // Close the confirmation modal first
    setConfirmModalVisible(false);

    if (!expedition || !user) {
      showToast('CANNOT COMPLETE — MISSING DATA');
      return;
    }

    if (mountedRef.current) setCompleting(true);
    logExpeditionCommandDev('[ExpeditionCommand] executeCompletion: starting completion flow');

    const title = expedition.title || 'this expedition';
    const doneCount = checklist.filter(i => i.is_done).length;
    const totalCount = checklist.length;
    const logCount = fieldLogs.length;
    const currentReadiness = computeReadiness(checklist);

    try {
      // 1. Store the current start_at for potential revert
      previousStartAtRef.current = expedition.start_at || null;

      // 2. Log a completion field log entry for audit trail
      const completionLog = await fieldLogStore.create(user.id, {
        expedition_id: expeditionId,
        type: 'note',
        title: 'Expedition Completed',
        body: `Expedition "${title}" marked as completed. ` +
          `Final readiness: ${currentReadiness.score}%. ` +
          `Checklist: ${doneCount}/${totalCount}. ` +
          `Total field logs: ${logCount + 1}.`,
      });

      // Store the completion log ID for potential undo
      if (completionLog) {
        completionLogIdRef.current = completionLog.id;
        // Add to local field logs list so it appears in the UI
        if (mountedRef.current) {
          setFieldLogs(prev => [completionLog, ...prev]);
        }
      }

      // 3. Update the final readiness score
      await expeditionStore.updateReadiness(expeditionId, user.id);

      // 4. Complete the expedition (sets status='completed', end_at=now — persists to Supabase)
      const completeResult = await expeditionStore.complete(expedition.id);
      logExpeditionCommandDev('[ExpeditionCommand] expeditionStore.complete result:', completeResult);

      if (!mountedRef.current) return;

      // 5. Update local expedition state to reflect completion
      const completedAt = new Date().toISOString();
      setExpedition(prev => prev ? {
        ...prev,
        status: 'completed' as any,
        end_at: completedAt,
      } : prev);

      // 6. Stop the Narrative Engine and flush remaining events to server
      try {
        if (narrativeEngine.isRunning()) {
          narrativeEngine.stop(); // stop() calls syncUnsyncedEvents() internally
          logExpeditionCommandDev('[ExpeditionCommand] Narrative engine stopped');
        }
        // Force a final sync of any remaining narrative events
        await narrativeEngine.syncNow();
        logExpeditionCommandDev('[ExpeditionCommand] Narrative events synced');
      } catch (narrativeErr) {
        console.warn('[ExpeditionCommand] Narrative engine cleanup error (non-blocking):', narrativeErr);
      }

      // 7. Generate completion summary for persistence
      const updatedExpedition: EcsExpedition = {
        ...expedition,
        status: 'completed' as any,
        end_at: completedAt,
      };
      const summary = generateCompletionSummary(
        updatedExpedition,
        checklist,
        fieldLogs,
        routes,
        waypoints,
      );
      completionSummaryRef.current = summary;
      logExpeditionCommandDev('[ExpeditionCommand] Completion summary generated');

      // 8. Show success toast
      showToast('EXPEDITION COMPLETED');

      // 9. Show the undo toast banner with 5-second window
      undoProgressAnim.setValue(1);
      setUndoVisible(true);

      // 10. Animate the progress bar from full to empty over 5 seconds
      Animated.timing(undoProgressAnim, {
        toValue: 0,
        duration: 5000,
        useNativeDriver: false,
      }).start();

      // 11. Start the 5-second timer — persist summary + navigate when it expires
      undoTimerRef.current = setTimeout(() => {
        undoTimerRef.current = null;
        handleUndoExpire();
      }, 5000);

      logExpeditionCommandDev('[ExpeditionCommand] Completion flow finished — undo window active');

    } catch (err: any) {
      console.error('[ExpeditionCommand] executeCompletion error:', err);
      if (!mountedRef.current) return;
      setCompleting(false);
      completionLogIdRef.current = null;
      previousStartAtRef.current = null;
      completionSummaryRef.current = null;
      showErrorModal(
        'Completion Failed',
        `Could not complete the expedition: ${err?.message || 'Unknown error'}. ` +
        'Please check your connection and try again.'
      );
    }
  }, [expedition, user, expeditionId, checklist, fieldLogs, routes, waypoints, showToast, showErrorModal, handleUndoExpire, undoProgressAnim]);

  // ── Confirmation modal derived data ───────────────────
  const confirmationStats = useMemo(() => {
    if (!expedition) return null;
    const doneCount = checklist.filter(i => i.is_done).length;
    const totalCount = checklist.length;
    const logCount = fieldLogs.length;
    return {
      title: expedition.title || 'this expedition',
      doneCount,
      totalCount,
      logCount,
      readinessScore: readiness.score,
    };
  }, [expedition, checklist, fieldLogs, readiness]);


  if (!user) return null;

  if (loading) {
    return (
      <TopoBackground>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TACTICAL.accent} />
          <Text style={styles.loadingText}>LOADING MISSION DATA...</Text>
        </View>
      </TopoBackground>
    );
  }

  if (!expedition) {
    return (
      <TopoBackground>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={TACTICAL.danger} />
          <Text style={styles.errorText}>MISSION NOT FOUND</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      </TopoBackground>
    );
  }

  const isActive = expedition.status === 'active';
  const isCompleted = expedition.status === 'completed' || expedition.status === 'archived';


  return (
    <TopoBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={TACTICAL.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerBrand}>MISSION COMMAND</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{expedition.title}</Text>
            <View style={{ marginTop: 4 }}>
              <ExpeditionStatePill phase={isActive ? 'active' : 'planning'} />
            </View>

          </View>
          <View style={styles.headerRight}>
            <View style={[styles.statusDot, { backgroundColor: isActive ? '#4CAF50' : TACTICAL.amber }]} />
            <Text style={[styles.statusText, { color: isActive ? '#4CAF50' : TACTICAL.amber }]}>
              {expedition.status.toUpperCase()}
            </Text>
          </View>
        </View>


        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Mission Info Bar */}
          <View style={styles.infoBar}>
            {terrain && (
              <View style={styles.infoChip}>
                <Ionicons name={terrain.icon as any} size={12} color={terrain.color} />
                <Text style={[styles.infoChipText, { color: terrain.color }]}>{terrain.label}</Text>
              </View>
            )}
            {expedition.duration_days && (
              <View style={styles.infoChip}>
                <Ionicons name="time-outline" size={12} color={TACTICAL.textMuted} />
                <Text style={styles.infoChipText}>{expedition.duration_days}D</Text>
              </View>
            )}
            {expedition.distance_from_services_mi && (
              <View style={styles.infoChip}>
                <Ionicons name="navigate-outline" size={12} color={TACTICAL.textMuted} />
                <Text style={styles.infoChipText}>{expedition.distance_from_services_mi}MI</Text>
              </View>
            )}
            <View style={styles.infoChip}>
              <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#4CAF50' : '#E53935' }]} />
              <Text style={[styles.infoChipText, { color: isOnline ? '#4CAF50' : '#E53935' }]}>
                {isOnline ? 'SYNCED' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          {/* Readiness Score */}
          <View style={styles.readinessCard}>
            <ReadinessRing score={readiness.score} />
            <View style={styles.readinessStats}>
              <View style={styles.readinessStat}>
                <Text style={styles.readinessStatValue}>{checklist.length}</Text>
                <Text style={styles.readinessStatLabel}>ITEMS</Text>
              </View>
              <View style={styles.readinessStat}>
                <Text style={styles.readinessStatValue}>{checklist.filter(i => i.is_done).length}</Text>
                <Text style={styles.readinessStatLabel}>DONE</Text>
              </View>
              <View style={styles.readinessStat}>
                <Text style={[styles.readinessStatValue, criticalItems.length > 0 && { color: '#E53935' }]}>
                  {criticalItems.length}
                </Text>
                <Text style={styles.readinessStatLabel}>CRITICAL</Text>
              </View>
            </View>
          </View>

          {/* Critical Items Preview */}
          {criticalItems.length > 0 && (
            <View style={styles.criticalCard}>
              <View style={styles.criticalHeader}>
                <Ionicons name="warning" size={16} color="#E53935" />
                <Text style={styles.criticalTitle}>CRITICAL ITEMS INCOMPLETE</Text>
              </View>
              {criticalItems.slice(0, 4).map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.criticalItem}
                  onPress={() => handleToggleChecklist(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="square-outline" size={18} color="#E53935" />
                  <Text style={styles.criticalItemText}>{item.title}</Text>
                </TouchableOpacity>
              ))}
              {criticalItems.length > 4 && (
                <Text style={styles.criticalMore}>+{criticalItems.length - 4} more critical items</Text>
              )}
            </View>
          )}

          {/* Quick Actions */}
          {isActive && (
            <View style={styles.quickActionsSection}>
              <Text style={styles.sectionLabel}>QUICK LOG</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsRow}>
                {(Object.entries(FIELD_LOG_TYPE_META) as [EcsFieldLogType, typeof FIELD_LOG_TYPE_META['note']][]).map(([type, meta]) => (
                  <TouchableOpacity
                    key={type}
                    style={styles.quickActionBtn}
                    onPress={() => handleQuickLog(type)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.quickActionIcon, { borderColor: `${meta.color}40` }]}>
                      <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                    </View>
                    <Text style={styles.quickActionLabel}>{meta.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Latest Narrative Moment (non-intrusive) */}
          {isActive && expeditionId ? (
            <LatestMomentBanner expeditionId={expeditionId} />
          ) : null}

          {/* Navigation Cards */}

          <View style={styles.navCards}>
            <TouchableOpacity
              style={[styles.navCard, { borderColor: '#66BB6A40' }]}
              onPress={() => router.push({ pathname: '/expedition-livelog', params: { id: expeditionId } } as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="pulse-outline" size={22} color="#66BB6A" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.navCardTitle, { color: '#66BB6A' }]}>LIVE LOG</Text>
                <Text style={styles.navCardSub}>Real-time event capture and timeline</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navCard, { borderColor: TACTICAL.amber + '40' }]}
              onPress={() => router.push({ pathname: '/expedition-dispatch', params: { id: expeditionId } } as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="radio-outline" size={22} color={TACTICAL.amber} />
              <View style={{ flex: 1 }}>
                <Text style={styles.navCardTitle}>DISPATCH FEED</Text>
                <Text style={styles.navCardSub}>Real-time event feed</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navCard, { borderColor: '#B388FF40' }]}
              onPress={() => router.push({ pathname: '/(tabs)/intelligence' } as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text-outline" size={22} color="#B388FF" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.navCardTitle, { color: '#B388FF' }]}>DEBRIEF & AAR</Text>
                <Text style={styles.navCardSub}>Post-expedition review and analysis</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>



            <TouchableOpacity
              style={styles.navCard}
              onPress={() => router.push({ pathname: '/expedition-checklist', params: { id: expeditionId } } as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="checkbox-outline" size={22} color={TACTICAL.amber} />
              <View style={{ flex: 1 }}>
                <Text style={styles.navCardTitle}>CHECKLIST</Text>
                <Text style={styles.navCardSub}>{checklist.filter(i => i.is_done).length}/{checklist.length} completed</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navCard}
              onPress={() => router.push({ pathname: '/expedition-log', params: { id: expeditionId } } as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="journal-outline" size={22} color={TACTICAL.amber} />
              <View style={{ flex: 1 }}>
                <Text style={styles.navCardTitle}>FIELD LOG</Text>
                <Text style={styles.navCardSub}>{fieldLogs.length} entries</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navCard}
              onPress={() => router.push({ pathname: '/expedition-route-mgr', params: { id: expeditionId } } as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="map-outline" size={22} color={TACTICAL.amber} />
              <View style={{ flex: 1 }}>
                <Text style={styles.navCardTitle}>ROUTE</Text>
                <Text style={styles.navCardSub}>{routes.length} route{routes.length !== 1 ? 's' : ''} / {waypoints.length} waypoints</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Export Data Button */}
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={() => setExportModalVisible(true)}
            activeOpacity={0.85}
          >
            <View style={styles.exportBtnIcon}>
              <Ionicons name="download-outline" size={18} color={TACTICAL.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.exportBtnTitle}>EXPORT DATA</Text>
              <Text style={styles.exportBtnSub}>
                Download expedition report as JSON or CSV
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
          </TouchableOpacity>


          {/* Recent Field Logs */}
          {fieldLogs.length > 0 && (
            <View style={styles.recentLogs}>
              <Text style={styles.sectionLabel}>RECENT FIELD LOGS</Text>
              {fieldLogs.slice(0, 5).map(log => {
                const meta = FIELD_LOG_TYPE_META[log.type] || FIELD_LOG_TYPE_META.note;
                return (
                  <View key={log.id} style={styles.logEntry}>
                    <View style={[styles.logIcon, { borderColor: `${meta.color}40` }]}>
                      <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logTitle}>{log.title || meta.label}</Text>
                      {log.body ? <Text style={styles.logBody} numberOfLines={2}>{log.body}</Text> : null}
                      <Text style={styles.logTime}>
                        {new Date(log.occurred_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Complete Expedition — Active: interactive button / Completed: disabled with status badge */}
          {isActive && (
            <View style={styles.completeBtnWrapper}>
              <TouchableOpacity
                style={[
                  styles.completeBtn,
                  completing && styles.completeBtnDisabled,
                ]}
                onPress={handleCompleteExpedition}
                disabled={completing}
                activeOpacity={0.7}
              >
                {completing
                  ? <ActivityIndicator size="small" color={TACTICAL.amber} />
                  : <Ionicons name="checkmark-circle-outline" size={18} color={TACTICAL.amber} />
                }
                <Text style={styles.completeBtnText}>
                  {completing ? 'COMPLETING...' : 'COMPLETE EXPEDITION'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Already Completed — disabled button with status badge */}
          {isCompleted && (
            <View style={styles.completedBadgeWrapper}>
              <View style={styles.completedBadge}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.completedBadgeTitle}>EXPEDITION {expedition.status.toUpperCase()}</Text>
                  {expedition.end_at && (
                    <Text style={styles.completedBadgeTime}>
                      {new Date(expedition.end_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.completedDebriefBtn}
                  onPress={() => router.push({ pathname: '/(tabs)/intelligence' } as any)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="document-text-outline" size={14} color="#B388FF" />
                  <Text style={styles.completedDebriefText}>DEBRIEF</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}




          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Quick Log Modal */}
        <Modal visible={logModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {FIELD_LOG_TYPE_META[logType]?.label || 'LOG'} ENTRY
                </Text>
                <TouchableOpacity onPress={() => setLogModalVisible(false)}>
                  <Ionicons name="close" size={22} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Type selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(Object.entries(FIELD_LOG_TYPE_META) as [EcsFieldLogType, typeof FIELD_LOG_TYPE_META['note']][]).map(([type, meta]) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.typeChip, logType === type && { borderColor: meta.color, backgroundColor: `${meta.color}15` }]}
                      onPress={() => setLogType(type)}
                    >
                      <Ionicons name={meta.icon as any} size={12} color={logType === type ? meta.color : TACTICAL.textMuted} />
                      <Text style={[styles.typeChipText, logType === type && { color: meta.color }]}>{meta.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <TextInput
                style={styles.modalInput}
                value={logTitle}
                onChangeText={setLogTitle}
                placeholder="Title (optional)"
                placeholderTextColor={TACTICAL.textMuted}
              />
              <TextInput
                style={[styles.modalInput, { height: 100, textAlignVertical: 'top' }]}
                value={logBody}
                onChangeText={setLogBody}
                placeholder="Details..."
                placeholderTextColor={TACTICAL.textMuted}
                multiline
              />

              <TouchableOpacity
                style={[styles.modalSaveBtn, logSaving && { opacity: 0.6 }]}
                onPress={handleSaveLog}
                disabled={logSaving}
                activeOpacity={0.85}
              >
                {logSaving ? <ActivityIndicator size="small" color="#0B0F12" /> : <Ionicons name="save-outline" size={16} color="#0B0F12" />}
                <Text style={styles.modalSaveBtnText}>{logSaving ? 'SAVING...' : 'SAVE LOG ENTRY'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Export Data Modal */}
        <ExportDataModal
          visible={exportModalVisible}
          onClose={() => setExportModalVisible(false)}
          expeditionId={expeditionId}
          expeditionTitle={expedition.title}
          userId={user.id}
        />

        {/* ── Complete Expedition Confirmation Modal ────────────── */}
        {/* Replaces Alert.alert for reliable cross-platform behavior. */}
        {/* Alert.alert maps to window.confirm on web which can fail  */}
        {/* silently in certain browser environments.                  */}
        <Modal
          visible={confirmModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmModalVisible(false)}
        >
          <View style={styles.confirmOverlay}>
            <View style={styles.confirmCard}>
              {/* Header */}
              <View style={styles.confirmHeader}>
                <View style={styles.confirmIconWrap}>
                  <Ionicons name="checkmark-circle-outline" size={28} color={TACTICAL.amber} />
                </View>
                <Text style={styles.confirmTitle}>COMPLETE EXPEDITION</Text>
              </View>

              {/* Body */}
              <Text style={styles.confirmBody}>
                Are you sure you want to mark{' '}
                <Text style={{ fontWeight: '900', color: TACTICAL.text }}>
                  "{confirmationStats?.title}"
                </Text>
                {' '}as completed?
              </Text>

              {/* Stats summary */}
              {confirmationStats && (
                <View style={styles.confirmStats}>
                  <View style={styles.confirmStatRow}>
                    <Ionicons name="checkbox-outline" size={14} color={TACTICAL.textMuted} />
                    <Text style={styles.confirmStatLabel}>Checklist</Text>
                    <Text style={styles.confirmStatValue}>
                      {confirmationStats.doneCount}/{confirmationStats.totalCount} done
                    </Text>
                  </View>
                  <View style={styles.confirmStatRow}>
                    <Ionicons name="journal-outline" size={14} color={TACTICAL.textMuted} />
                    <Text style={styles.confirmStatLabel}>Field logs</Text>
                    <Text style={styles.confirmStatValue}>
                      {confirmationStats.logCount} entries
                    </Text>
                  </View>
                  <View style={styles.confirmStatRow}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={TACTICAL.textMuted} />
                    <Text style={styles.confirmStatLabel}>Readiness</Text>
                    <Text style={[
                      styles.confirmStatValue,
                      { color: confirmationStats.readinessScore >= 80 ? '#4CAF50' : confirmationStats.readinessScore >= 50 ? TACTICAL.amber : '#E53935' },
                    ]}>
                      {confirmationStats.readinessScore}%
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.confirmNote}>
                This will end the active expedition, unlock Debrief & AAR, and move it to your archive.
              </Text>

              {/* Buttons */}
              <View style={styles.confirmButtons}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => setConfirmModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.confirmCancelText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmAcceptBtn}
                  onPress={executeCompletion}
                  activeOpacity={0.7}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#0B0F12" />
                  <Text style={styles.confirmAcceptText}>COMPLETE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Error / Info Modal (replaces Alert.alert for errors) ── */}
        <Modal
          visible={errorModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setErrorModalVisible(false)}
        >
          <View style={styles.confirmOverlay}>
            <View style={styles.confirmCard}>
              <View style={styles.confirmHeader}>
                <View style={[styles.confirmIconWrap, { borderColor: 'rgba(229, 57, 53, 0.3)', backgroundColor: 'rgba(229, 57, 53, 0.08)' }]}>
                  <Ionicons name="alert-circle-outline" size={28} color="#E53935" />
                </View>
                <Text style={[styles.confirmTitle, { color: '#E53935' }]}>{errorModalTitle}</Text>
              </View>
              <Text style={styles.confirmBody}>{errorModalMessage}</Text>
              <View style={[styles.confirmButtons, { justifyContent: 'flex-end' }]}>
                <TouchableOpacity
                  style={styles.confirmAcceptBtn}
                  onPress={() => setErrorModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.confirmAcceptText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Undo Completion Toast Banner ─────────────────── */}
        {undoVisible && (
          <View style={styles.undoOverlay}>
            <TouchableOpacity
              style={styles.undoBanner}
              onPress={handleUndo}
              activeOpacity={0.85}
            >
              <View style={styles.undoContent}>
                <View style={styles.undoLeft}>
                  <View style={styles.undoIconWrap}>
                    <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.undoTitle}>EXPEDITION COMPLETED</Text>
                    <Text style={styles.undoSubtitle}>Tap to undo before navigating away</Text>
                  </View>
                </View>
                <View style={styles.undoAction}>
                  <Ionicons name="arrow-undo-outline" size={16} color={TACTICAL.amber} />
                  <Text style={styles.undoActionText}>UNDO</Text>
                </View>
              </View>
              {/* Animated progress bar */}
              <View style={styles.undoProgressTrack}>
                <Animated.View
                  style={[
                    styles.undoProgressBar,
                    {
                      width: undoProgressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
            </TouchableOpacity>
          </View>
        )}

      </View>
    </TopoBackground>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { fontSize: 12, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  errorText: { fontSize: 14, fontWeight: '800', color: TACTICAL.danger, letterSpacing: 0.5 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: TACTICAL.accent, borderRadius: 10 },
  retryText: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 16 : 54, paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border },
  headerBrand: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 2 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  content: { paddingHorizontal: 16, paddingTop: 4 },

  // Info Bar
  infoBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  infoChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border },
  infoChipText: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  onlineDot: { width: 6, height: 6, borderRadius: 3 },

  // Readiness
  readinessCard: {
    flexDirection: 'row', alignItems: 'center', gap: 20, padding: 16, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border, marginBottom: 12,
  },
  ringContainer: { alignItems: 'center' },
  ringOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringScore: { fontSize: 22, fontWeight: '900', fontFamily: 'Courier' },
  ringLabel: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2 },
  readinessStats: { flex: 1, gap: 8 },
  readinessStat: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  readinessStatValue: { fontSize: 18, fontWeight: '900', color: TACTICAL.text, fontFamily: 'Courier' },
  readinessStatLabel: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },

  // Critical
  criticalCard: {
    padding: 14, borderRadius: 14, backgroundColor: 'rgba(229, 57, 53, 0.06)',
    borderWidth: 1, borderColor: 'rgba(229, 57, 53, 0.3)', marginBottom: 14,
  },
  criticalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  criticalTitle: { fontSize: 11, fontWeight: '900', color: '#E53935', letterSpacing: 1.2 },
  criticalItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  criticalItemText: { fontSize: 12, fontWeight: '700', color: TACTICAL.text },
  criticalMore: { fontSize: 11, color: '#E53935', marginTop: 6, fontStyle: 'italic' },

  // Quick Actions
  quickActionsSection: { marginBottom: 14 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 2, marginBottom: 10 },
  quickActionsRow: { gap: 10 },
  quickActionBtn: { alignItems: 'center', gap: 6, width: 64 },
  quickActionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1 },
  quickActionLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5, textAlign: 'center' },

  // Nav Cards
  navCards: { gap: 8, marginBottom: 14 },
  navCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border,
  },
  navCardTitle: { fontSize: 12, fontWeight: '900', color: TACTICAL.text, letterSpacing: 1.2 },
  navCardSub: { fontSize: 11, color: TACTICAL.textMuted, marginTop: 2 },

  // Export Button
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(196, 138, 44, 0.06)', borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)', marginBottom: 14,
  },
  exportBtnIcon: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.12)', borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
  },
  exportBtnTitle: { fontSize: 12, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.2 },
  exportBtnSub: { fontSize: 10, color: TACTICAL.textMuted, marginTop: 2 },

  // Recent Logs
  recentLogs: { marginBottom: 14 },
  logEntry: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(62, 79, 60, 0.15)' },
  logIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1 },
  logTitle: { fontSize: 12, fontWeight: '800', color: TACTICAL.text },
  logBody: { fontSize: 11, color: TACTICAL.textMuted, marginTop: 2, lineHeight: 16 },
  logTime: { fontSize: 10, color: TACTICAL.textMuted, fontFamily: 'Courier', marginTop: 4 },

  // Complete Button
  completeBtnWrapper: {
    zIndex: 10,
    marginTop: 8,
  },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 12, borderWidth: 1, borderColor: TACTICAL.amber,
  },
  completeBtnDisabled: {
    opacity: 0.6,
  },
  completeBtnText: { fontSize: 12, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.2 },

  // Completed Badge
  completedBadgeWrapper: {
    marginTop: 8,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  completedBadgeTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1.2,
  },
  completedBadgeTime: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginTop: 2,
  },
  completedDebriefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(179, 136, 255, 0.3)',
    backgroundColor: 'rgba(179, 136, 255, 0.08)',
  },
  completedDebriefText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B388FF',
    letterSpacing: 1,
  },


  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: TACTICAL.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'web' ? 20 : 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 14, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border },
  typeChipText: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderColor: TACTICAL.border,
    borderRadius: 12, padding: 14, color: TACTICAL.text, fontSize: 14, marginBottom: 12,
  },
  modalSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, backgroundColor: TACTICAL.amber,
  },
  modalSaveBtnText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },

  // ── Confirmation Modal ──────────────────────────────────
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  confirmHeader: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  confirmIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${TACTICAL.amber}12`,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}30`,
  },
  confirmTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  confirmBody: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmStats: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  confirmStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmStatLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  confirmStatValue: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  confirmNote: {
    fontSize: 11,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  confirmCancelText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  confirmAcceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  confirmAcceptText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1,
  },

  // Undo Toast Banner
  undoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'web' ? 16 : 36,
    zIndex: 999,
  },
  undoBanner: {
    backgroundColor: '#1A2420',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#4CAF5060',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  undoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  undoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  undoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  undoTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1.2,
  },
  undoSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  undoAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${TACTICAL.amber}50`,
    backgroundColor: `${TACTICAL.amber}10`,
  },
  undoActionText: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  undoProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
  },
  undoProgressBar: {
    height: 3,
    backgroundColor: '#4CAF50',
  },
});




