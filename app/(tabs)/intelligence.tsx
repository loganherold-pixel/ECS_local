/**
 * Intelligence Tab — ECS Pillar 3: Expedition Intelligence
 * 
 * Phase 1: Live Log Foundation (functional)
 * Phase 2: Debrief Wizard + AAR Generator (functional)
 * Phase 3: Cross-Expedition Trends (functional)
 * - Top insert tabs: Live Log | Debrief | AAR | Trends
 * - Live Log: event capture + timeline
 * - Debrief: 3-step micro-wizard (Outcomes, Performance, Lessons)
 * - AAR: Performance Summary, Risk & Incidents, Recommendations + AI
 * - Trends: Cross-expedition analytics, patterns, AI fleet analysis
 * - No vertical scroll on standard devices
 */


import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  Platform, Dimensions, FlatList, ActivityIndicator, Modal,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';
import TopoBackground from '../../components/TopoBackground';
import { TACTICAL } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import { getCachedExpeditions } from '../../lib/expeditionCache';
import {
  expeditionEventStore,
  EVENT_TYPE_META,
  SEVERITY_META,
  type ExpeditionEvent,
  type EventType,
  type EventSeverity,
  type CreateEventInput,
} from '../../lib/expeditionEventStore';
import DebriefWizard from '../../components/intelligence/DebriefWizard';
import AARView from '../../components/intelligence/AARView';
import TrendsView from '../../components/intelligence/TrendsView';



const { width: SW, height: SH } = Dimensions.get('window');

// ── Sub-tab type ─────────────────────────────────────────────
type SubTab = 'livelog' | 'debrief' | 'aar' | 'trends';


// ── Quick-button event types ─────────────────────────────────
const QUICK_TYPES: EventType[] = ['NOTE', 'RISK', 'MECH', 'MED', 'NAV', 'SUPPLY'];

// ── Filter chips ─────────────────────────────────────────────
const FILTER_CHIPS: (EventType | 'ALL')[] = ['ALL', 'RISK', 'MECH', 'MED', 'NAV'];

// ── Status pill colors ───────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active:    { bg: 'rgba(102,187,106,0.18)', text: '#66BB6A' },
  draft:     { bg: 'rgba(138,138,133,0.15)', text: '#8A8A85' },
  completed: { bg: 'rgba(196,138,44,0.15)',  text: '#C48A2C' },
  archived:  { bg: 'rgba(138,138,133,0.10)', text: '#666' },
  closed:    { bg: 'rgba(192,57,43,0.12)',   text: '#C0392B' },
};

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

function IntelligenceInner() {
  const { user, showToast } = useApp();

  // ── Expedition selection ────────────────────────────────────
  const [expeditions, setExpeditions] = useState<any[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);

  useEffect(() => {
    const exps = getCachedExpeditions();
    setExpeditions(exps);
    // Auto-select first active expedition
    const active = exps.find((e: any) => e.status === 'active');
    if (active) setSelectedExpId(active.id);
    else if (exps.length > 0) setSelectedExpId(exps[0].id);
  }, []);

  const selectedExp = useMemo(
    () => expeditions.find((e: any) => e.id === selectedExpId) || null,
    [expeditions, selectedExpId]
  );

  const isReadOnly = selectedExp?.status === 'completed' || selectedExp?.status === 'archived' || selectedExp?.status === 'closed';


  // ── Sub-tab state ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SubTab>('livelog');

  // ── Event state ────────────────────────────────────────────
  const [events, setEvents] = useState<ExpeditionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<EventType | 'ALL'>('ALL');
  const [viewAllModal, setViewAllModal] = useState(false);

  // ── Capture form state ─────────────────────────────────────
  const [selType, setSelType] = useState<EventType>('NOTE');
  const [selSeverity, setSelSeverity] = useState<EventSeverity>('LOW');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Store subscription ─────────────────────────────────────
  useEffect(() => {
    const unsub = expeditionEventStore.subscribe(() => {
      if (selectedExpId) {
        setEvents(expeditionEventStore.getFilteredEvents(selectedExpId, filter));
      }
    });
    return unsub;
  }, [selectedExpId, filter]);

  // ── Load events on expedition change ───────────────────────
  useEffect(() => {
    if (!selectedExpId) return;
    setLoading(true);
    expeditionEventStore.loadEvents(selectedExpId, { limit: 50 }).then(() => {
      setEvents(expeditionEventStore.getFilteredEvents(selectedExpId, filter));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedExpId]);

  // ── Filter change ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedExpId) return;
    setEvents(expeditionEventStore.getFilteredEvents(selectedExpId, filter));
  }, [filter, selectedExpId]);

  // ── Submit event ───────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!selectedExpId || !details.trim()) {
      showToast('Enter event details');
      return;
    }
    setSubmitting(true);
    const input: CreateEventInput = {
      expedition_id: selectedExpId,
      created_by: user?.id || null,
      event_type: selType,
      severity: selSeverity,
      details: details.trim(),
    };
    await expeditionEventStore.createEvent(input, (msg) => showToast(msg));
    setDetails('');
    setSubmitting(false);
    showToast('Event logged');
  }, [selectedExpId, selType, selSeverity, details, user, showToast]);

  // ── Expedition picker (compact) ────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Filtered display events (capped at 8 for no-scroll) ───
  const displayEvents = events.slice(0, 8);
  const hasMore = events.length > 8;

  // ── Debrief complete handler ───────────────────────────────
  // Called after: saveDebrief → closeAndGenerateAAR → success
  // Updates local expedition status to 'closed' and switches to AAR tab.
  const handleDebriefComplete = useCallback(() => {
    // Update local expedition status to 'closed' (matches RPC behavior)
    if (selectedExpId) {
      setExpeditions(prev => prev.map(exp =>
        exp.id === selectedExpId ? { ...exp, status: 'closed' } : exp
      ));
    }
    // Switch to AAR tab to view the generated report
    setActiveTab('aar');
  }, [selectedExpId]);



  return (
    <TopoBackground>
      <View style={s.container}>
        {/* ── HEADER ──────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.headerIconWrap}>
              <Ionicons name="analytics-outline" size={16} color={TACTICAL.amber} />
            </View>
            <View>
              <Text style={s.headerMode}>INTELLIGENCE MODE</Text>
              <Text style={s.headerTitle}>INTELLIGENCE</Text>
            </View>
          </View>
        </View>

        {/* ── SUB-TAB BAR ─────────────────────────────────── */}
        <View style={s.tabBar}>
          {([
            { key: 'livelog' as SubTab, label: 'LIVE LOG', icon: 'pulse-outline' },
            { key: 'debrief' as SubTab, label: 'DEBRIEF', icon: 'document-text-outline' },
            { key: 'aar' as SubTab, label: 'AAR', icon: 'git-compare-outline' },
            { key: 'trends' as SubTab, label: 'TRENDS', icon: 'trending-up-outline' },
          ]).map(t => {
            const active = activeTab === t.key;
            const isTrends = t.key === 'trends';
            return (
              <TouchableOpacity
                key={t.key}
                style={[
                  s.tab,
                  active && s.tabActive,
                  isTrends && !active && { borderColor: 'rgba(179,136,255,0.2)', backgroundColor: 'rgba(179,136,255,0.04)' },
                  isTrends && active && { borderColor: 'rgba(179,136,255,0.4)', backgroundColor: 'rgba(179,136,255,0.08)' },
                ]}
                onPress={() => setActiveTab(t.key)}
                activeOpacity={0.7}
              >
                <Ionicons name={t.icon as any} size={13} color={active ? (isTrends ? '#B388FF' : TACTICAL.amber) : TACTICAL.textMuted} />
                <Text style={[s.tabLabel, active && (isTrends ? { color: '#B388FF' } : s.tabLabelActive)]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>


        {/* ── CONTENT AREA ────────────────────────────────── */}
        <View style={s.content}>
          {activeTab === 'livelog' && (
            <LiveLogContent
              selectedExp={selectedExp}
              isReadOnly={isReadOnly}
              expeditions={expeditions}
              onPickExpedition={(id) => { setSelectedExpId(id); setPickerOpen(false); }}
              pickerOpen={pickerOpen}
              setPickerOpen={setPickerOpen}
              selType={selType}
              setSelType={setSelType}
              selSeverity={selSeverity}
              setSelSeverity={setSelSeverity}
              details={details}
              setDetails={setDetails}
              submitting={submitting}
              onSubmit={handleSubmit}
              displayEvents={displayEvents}
              hasMore={hasMore}
              filter={filter}
              setFilter={setFilter}
              loading={loading}
              onViewAll={() => setViewAllModal(true)}
            />
          )}
          {activeTab === 'debrief' && (
            <DebriefWizard
              expedition={selectedExp}
              userId={user?.id || null}
              onComplete={handleDebriefComplete}
              showToast={showToast}
              isReadOnly={isReadOnly}
            />
          )}
          {activeTab === 'aar' && (
            <AARView
              expedition={selectedExp}
              showToast={showToast}
            />
          )}
          {activeTab === 'trends' && (
            <TrendsView
              showToast={showToast}
            />
          )}
        </View>




        {/* ── VIEW ALL MODAL ──────────────────────────────── */}
        <Modal visible={viewAllModal} transparent animationType="slide" onRequestClose={() => setViewAllModal(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>ALL EVENTS</Text>
                <TouchableOpacity onPress={() => setViewAllModal(false)} style={s.modalClose}>
                  <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={events}
                keyExtractor={e => e.id}
                renderItem={({ item }) => <EventRow event={item} />}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 40 }}
              />
            </View>
          </View>
        </Modal>
      </View>
    </TopoBackground>
  );
}

// ══════════════════════════════════════════════════════════════
// LIVE LOG CONTENT (inlined)
// ══════════════════════════════════════════════════════════════

function LiveLogContent({
  selectedExp, isReadOnly, expeditions, onPickExpedition,
  pickerOpen, setPickerOpen,
  selType, setSelType, selSeverity, setSelSeverity,
  details, setDetails, submitting, onSubmit,
  displayEvents, hasMore, filter, setFilter, loading, onViewAll,
}: any) {
  const status = selectedExp?.status || 'draft';
  const sc = STATUS_COLORS[status] || STATUS_COLORS.draft;

  return (
    <View style={s.liveLog}>
      {/* ── Expedition Header + Status ─────────────────── */}
      <TouchableOpacity style={s.expHeader} onPress={() => setPickerOpen(!pickerOpen)} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={s.expTitle} numberOfLines={2}>

            {selectedExp?.title || 'No Expedition Selected'}
          </Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: sc.bg }]}>
          <Text style={[s.statusText, { color: sc.text }]}>{status.toUpperCase()}</Text>
        </View>
        <Ionicons name="chevron-down" size={14} color={TACTICAL.textMuted} style={{ marginLeft: 6 }} />
      </TouchableOpacity>

      {/* ── Expedition Picker Dropdown ─────────────────── */}
      {pickerOpen && (
        <View style={s.picker}>
          {expeditions.map((exp: any) => (
            <TouchableOpacity
              key={exp.id}
              style={[s.pickerItem, exp.id === selectedExp?.id && s.pickerItemActive]}
              onPress={() => onPickExpedition(exp.id)}
            >
              <Text style={s.pickerItemText} numberOfLines={2}>{exp.title}</Text>

              <View style={[s.statusPillSm, { backgroundColor: (STATUS_COLORS[exp.status] || STATUS_COLORS.draft).bg }]}>
                <Text style={[s.statusTextSm, { color: (STATUS_COLORS[exp.status] || STATUS_COLORS.draft).text }]}>
                  {(exp.status || 'draft').toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          {expeditions.length === 0 && (
            <Text style={s.pickerEmpty}>No expeditions found</Text>
          )}
        </View>
      )}

      {/* ── Stat Chips (Fuel / Water / Power) ─────────── */}
      <View style={s.statRow}>
        <View style={s.statChip}>
          <Ionicons name="flame-outline" size={12} color="#FF9500" />
          <Text style={s.statLabel}>FUEL</Text>
          <Text style={s.statValue}>--</Text>
        </View>
        <View style={s.statChip}>
          <Ionicons name="water-outline" size={12} color="#4FC3F7" />
          <Text style={s.statLabel}>WATER</Text>
          <Text style={s.statValue}>--</Text>
        </View>
        <View style={s.statChip}>
          <Ionicons name="battery-half-outline" size={12} color="#66BB6A" />
          <Text style={s.statLabel}>POWER</Text>
          <Text style={s.statValue}>--</Text>
        </View>
      </View>

      {/* ── Event Capture Panel ────────────────────────── */}
      {!isReadOnly && selectedExp && (
        <View style={s.capturePanel}>
          {/* Quick type buttons */}
          <View style={s.quickRow}>
            {QUICK_TYPES.map(t => {
              const meta = EVENT_TYPE_META[t];
              const active = selType === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[s.quickBtn, active && { borderColor: meta.color, backgroundColor: `${meta.color}12` }]}
                  onPress={() => setSelType(t)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={meta.icon as any} size={11} color={active ? meta.color : TACTICAL.textMuted} />
                  <Text style={[s.quickLabel, active && { color: meta.color }]}>{meta.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Input row */}
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="What happened?"
              placeholderTextColor="rgba(138,138,133,0.5)"
              value={details}
              onChangeText={setDetails}
              maxLength={200}
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />
          </View>

          {/* Severity + Add */}
          <View style={s.sevRow}>
            <View style={s.sevChips}>
              {(['LOW', 'MED', 'HIGH', 'CRITICAL'] as EventSeverity[]).map(sev => {
                const meta = SEVERITY_META[sev];
                const active = selSeverity === sev;
                return (
                  <TouchableOpacity
                    key={sev}
                    style={[s.sevChip, active && { borderColor: meta.color, backgroundColor: meta.bg }]}
                    onPress={() => setSelSeverity(sev)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.sevLabel, active && { color: meta.color }]}>{meta.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[s.addBtn, (!details.trim() || submitting) && s.addBtnDisabled]}
              onPress={onSubmit}
              disabled={!details.trim() || submitting}
              activeOpacity={0.7}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#0B0F12" />
                : <Text style={s.addBtnText}>ADD</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isReadOnly && selectedExp && (
        <View style={s.readOnlyBanner}>
          <Ionicons name="lock-closed-outline" size={13} color={TACTICAL.textMuted} />
          <Text style={s.readOnlyText}>Expedition closed — Live Log is read-only</Text>
        </View>
      )}

      {/* ── Filter Chips ──────────────────────────────── */}
      <View style={s.filterRow}>
        {FILTER_CHIPS.map(f => {
          const active = filter === f;
          const color = f === 'ALL' ? TACTICAL.amber : (EVENT_TYPE_META[f as EventType]?.color || TACTICAL.textMuted);
          return (
            <TouchableOpacity
              key={f}
              style={[s.filterChip, active && { borderColor: color, backgroundColor: `${color}15` }]}
              onPress={() => setFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[s.filterLabel, active && { color }]}>{f}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Timeline ──────────────────────────────────── */}
      <View style={s.timeline}>
        {loading && displayEvents.length === 0 && (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="small" color={TACTICAL.amber} />
            <Text style={s.loadingText}>Loading events...</Text>
          </View>
        )}
        {!loading && displayEvents.length === 0 && (
          <View style={s.emptyWrap}>
            <Ionicons name="document-text-outline" size={28} color="rgba(138,138,133,0.3)" />
            <Text style={s.emptyText}>No events logged yet</Text>
            <Text style={s.emptyHint}>Use the capture panel above to log your first event</Text>
          </View>
        )}
        {displayEvents.map((ev: ExpeditionEvent) => (
          <EventRow key={ev.id} event={ev} />
        ))}
        {hasMore && (
          <TouchableOpacity style={s.viewAllBtn} onPress={onViewAll} activeOpacity={0.7}>
            <Text style={s.viewAllText}>VIEW ALL ({displayEvents.length}+ events)</Text>
            <Ionicons name="chevron-forward" size={12} color={TACTICAL.amber} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// EVENT ROW
// ══════════════════════════════════════════════════════════════

function EventRow({ event }: { event: ExpeditionEvent }) {
  const meta = EVENT_TYPE_META[event.event_type] || EVENT_TYPE_META.NOTE;
  const sevMeta = SEVERITY_META[event.severity] || SEVERITY_META.LOW;

  return (
    <View style={[s.eventRow, event._optimistic && s.eventOptimistic, event._failed && s.eventFailed]}>
      <View style={[s.eventIcon, { backgroundColor: `${meta.color}15` }]}>
        <Ionicons name={meta.icon as any} size={13} color={meta.color} />
      </View>
      <View style={s.eventBody}>
        <View style={s.eventTopRow}>
          <Text style={[s.eventType, { color: meta.color }]}>{meta.label}</Text>
          <View style={[s.eventSevBadge, { backgroundColor: sevMeta.bg }]}>
            <Text style={[s.eventSevText, { color: sevMeta.color }]}>{sevMeta.label}</Text>
          </View>
          {event._optimistic && <Text style={s.syncingLabel}>SYNCING</Text>}
          {event._failed && <Text style={s.failedLabel}>LOCAL</Text>}
        </View>
        <Text style={s.eventDetails} numberOfLines={2}>{event.details}</Text>
        <Text style={s.eventTime}>{timeAgo(event.created_at)}</Text>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// COMING SOON PLACEHOLDER
// ══════════════════════════════════════════════════════════════

function ComingSoon({ title, icon, desc }: { title: string; icon: string; desc: string }) {
  return (
    <View style={s.comingSoon}>
      <View style={s.csIconWrap}>
        <Ionicons name={icon as any} size={36} color="rgba(196,138,44,0.3)" />
      </View>
      <Text style={s.csTitle}>{title}</Text>
      <Text style={s.csLabel}>COMING SOON</Text>
      <Text style={s.csDesc}>{desc}</Text>
      <View style={s.csBorder} />
      <Text style={s.csPhase}>PHASE 2</Text>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════

export default function IntelligenceScreen() {
  return (
    <TabErrorBoundary tabName="INTELLIGENCE">
      <IntelligenceInner />
    </TabErrorBoundary>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 16 : 54, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.15)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(196,138,44,0.08)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerMode: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 2 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5 },

  // Sub-tabs
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 8,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.25)', backgroundColor: 'rgba(0,0,0,0.15)',
  },
  tabActive: { borderColor: 'rgba(196,138,44,0.4)', backgroundColor: 'rgba(196,138,44,0.08)' },
  tabLabel: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  tabLabelActive: { color: TACTICAL.amber },

  // Content
  content: { flex: 1, paddingBottom: Platform.OS === 'web' ? 70 : 90 },

  // Live Log
  liveLog: { flex: 1, paddingHorizontal: 14 },

  // Expedition header
  expHeader: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8,
  },
  expTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.5 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 8, fontWeight: '800', letterSpacing: 1.5 },
  statusPillSm: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusTextSm: { fontSize: 7, fontWeight: '800', letterSpacing: 1 },

  // Picker
  picker: {
    backgroundColor: '#151A1E', borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.3)', marginBottom: 6, overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.1)',
  },
  pickerItemActive: { backgroundColor: 'rgba(196,138,44,0.06)' },
  pickerItemText: { fontSize: 12, fontWeight: '600', color: TACTICAL.text, flex: 1 },
  pickerEmpty: { fontSize: 11, color: TACTICAL.textMuted, padding: 16, textAlign: 'center' },

  // Stat chips
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.15)',
  },
  statLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  statValue: { fontSize: 11, fontWeight: '700', color: TACTICAL.text, fontFamily: 'Courier', marginLeft: 'auto' as any },

  // Capture panel
  capturePanel: {
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', marginBottom: 8,
  },
  quickRow: { flexDirection: 'row', gap: 5, marginBottom: 8, flexWrap: 'wrap' },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', backgroundColor: 'rgba(0,0,0,0.15)',
  },
  quickLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  inputRow: { marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', color: TACTICAL.text, fontSize: 13,
  },
  sevRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sevChips: { flexDirection: 'row', gap: 5, flex: 1 },
  sevChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', backgroundColor: 'rgba(0,0,0,0.1)',
  },
  sevLabel: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  addBtn: {
    backgroundColor: TACTICAL.amber, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { fontSize: 11, fontWeight: '800', color: '#0B0F12', letterSpacing: 2 },

  // Read-only banner
  readOnlyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.15)', marginBottom: 8,
  },
  readOnlyText: { fontSize: 11, color: TACTICAL.textMuted },

  // Filter chips
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(62,79,60,0.2)', backgroundColor: 'rgba(0,0,0,0.1)',
  },
  filterLabel: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },

  // Timeline
  timeline: { flex: 1 },
  loadingWrap: { alignItems: 'center', paddingTop: 30, gap: 8 },
  loadingText: { fontSize: 10, color: TACTICAL.textMuted, letterSpacing: 1 },
  emptyWrap: { alignItems: 'center', paddingTop: 24, gap: 6 },
  emptyText: { fontSize: 13, fontWeight: '700', color: TACTICAL.textMuted },
  emptyHint: { fontSize: 10, color: 'rgba(138,138,133,0.5)', textAlign: 'center', maxWidth: 220 },

  // Event row
  eventRow: {
    flexDirection: 'row', gap: 8, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.08)',
  },
  eventOptimistic: { opacity: 0.7 },
  eventFailed: { borderLeftWidth: 2, borderLeftColor: '#FF9500', paddingLeft: 6 },
  eventIcon: {
    width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
  },
  eventBody: { flex: 1 },
  eventTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  eventType: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  eventSevBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  eventSevText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5 },
  syncingLabel: { fontSize: 7, fontWeight: '700', color: '#5AC8FA', letterSpacing: 0.5 },
  failedLabel: { fontSize: 7, fontWeight: '700', color: '#FF9500', letterSpacing: 0.5 },
  eventDetails: { fontSize: 12, color: TACTICAL.text, lineHeight: 16 },
  eventTime: { fontSize: 9, color: TACTICAL.textMuted, marginTop: 2, fontFamily: 'Courier' },

  // View all
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, marginTop: 4,
  },
  viewAllText: { fontSize: 10, fontWeight: '700', color: TACTICAL.amber, letterSpacing: 1 },

  // Coming soon
  comingSoon: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  csIconWrap: {
    width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.05)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.12)',
    marginBottom: 16,
  },
  csTitle: { fontSize: 16, fontWeight: '800', color: TACTICAL.text, letterSpacing: 2, marginBottom: 6 },
  csLabel: {
    fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 3,
    backgroundColor: 'rgba(196,138,44,0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6,
    overflow: 'hidden', marginBottom: 12,
  },
  csDesc: { fontSize: 12, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
  csBorder: {
    width: 40, height: 1, backgroundColor: 'rgba(62,79,60,0.2)', marginVertical: 16,
  },
  csPhase: { fontSize: 9, fontWeight: '700', color: 'rgba(138,138,133,0.4)', letterSpacing: 3 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalSheet: {
    height: '75%', backgroundColor: '#0F1612', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(62,79,60,0.35)',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  modalTitle: { fontSize: 13, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2 },
  modalClose: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(62,79,60,0.25)',
  },
});




