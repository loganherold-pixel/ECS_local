/**
 * Intel Tab — Hybrid Civilian + Agency Ready Structure
 *
 * ══════════════════════════════════════════════════════════════
 * Restructured: Main view is a quick situational brief (NO SCROLL).
 * Secondary/reference content in top insert tab bottom sheets.
 * ══════════════════════════════════════════════════════════════
 *
 * Main view (fixed, no scrolling — matches Safety tab model):
 *   1. Environmental Intelligence (Weather, Terrain, Risk, Alerts)
 *   2. Operator & Settings (compact footer)
 *
 * Insert Tabs (chips → bottom sheet panels):
 *   - Permits & Access
 *   - Documentation Center
 *   - Trip Summaries
 *
 * Radio Frequencies removed from Intel (lives in Safety → Comms).
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';


import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';

import { useApp } from '../../context/AppContext';
import { getBuilderState, getCachedExpeditions } from '../../lib/expeditionCache';
import { routeStore, type ImportedRoute } from '../../lib/routeStore';
import { calculateRisk, getRiskColor, getPackingStats } from '../../lib/calculations';
import TopoBackground from '../../components/TopoBackground';

// ── Intel Section Components ─────────────────────────────────
import EnvironmentalIntel from '../../components/intel/EnvironmentalIntel';
import DocumentPreviewModal, { ECS_VERSION, ECS_PRODUCT } from '../../components/intel/DocumentPreviewModal';
import IntelInsertTabs from '../../components/intel/IntelInsertTabs';

// Export inner component for use in unified Alert tab
export function IntelScreenInner({ embedded = false }: { embedded?: boolean }) {


  const router = useRouter();
  const {
    activeTrip, loadItems, riskScore, userSettings,
    refreshActiveTrip, showToast, user, operatorInfo, signOut,
  } = useApp();

  // ── Local State ────────────────────────────────────────────
  const [builderState, setBuilderStateLocal] = useState<any>({});
  const [routes, setRoutes] = useState<ImportedRoute[]>([]);
  const [expeditions, setExpeditions] = useState<any[]>([]);

  // Document Preview Modal state
  const [docPreviewVisible, setDocPreviewVisible] = useState(false);
  const [docPreviewId, setDocPreviewId] = useState('');
  const [docPreviewTitle, setDocPreviewTitle] = useState('');
  const [docPreviewCategory, setDocPreviewCategory] = useState<'system' | 'operational'>('system');
  const [docPreviewContent, setDocPreviewContent] = useState<string | undefined>(undefined);

  // ── Data Refresh ───────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      refreshActiveTrip();
      setBuilderStateLocal(getBuilderState());
      setRoutes(routeStore.getAll());
      setExpeditions(getCachedExpeditions());
    }, [])
  );

  // ── Computed Values ────────────────────────────────────────
  const activeRoute = useMemo(() => routeStore.getActive(), [routes]);

  const risk = useMemo(() => {
    if (riskScore) {
      return calculateRisk(riskScore);
    }
    return { score: 0, level: 'N/A' as any };
  }, [riskScore]);

  const riskColor = getRiskColor(risk.level);

  const loadoutStats = useMemo(() => {
    if (activeTrip) {
      return getPackingStats(loadItems, activeTrip.active_mode || 'Trip');
    }
    return { totalActive: 0, packedActive: 0, pct: 0 };
  }, [activeTrip, loadItems]);

  // ── Document Preview Handlers ──────────────────────────────
  const handleViewDocument = useCallback((
    id: string,
    title: string,
    category: 'system' | 'operational',
    content?: string
  ) => {
    setDocPreviewId(id);
    setDocPreviewTitle(title);
    setDocPreviewCategory(category);
    setDocPreviewContent(content);
    setDocPreviewVisible(true);
  }, []);

  const handleCloseDocPreview = useCallback(() => {
    setDocPreviewVisible(false);
  }, []);

  // ── Export Handlers ────────────────────────────────────────
  const handleExportContent = useCallback((content: string, filename?: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename || 'ecs-export'}-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('DOCUMENT EXPORTED');
    } else {
      showToast('Export available on web');
    }
  }, [showToast]);

  const Wrapper = embedded ? View : TopoBackground;

  return (
    <Wrapper style={embedded ? { flex: 1 } : undefined}>
      <View style={styles.container}>
        {/* ══════════════════════════════════════════════════
            HEADER — Professional, restrained (hidden when embedded in Alert tab)
            ══════════════════════════════════════════════════ */}
        {!embedded && (
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="radio-outline" size={16} color={TACTICAL.amber} />
              </View>
              <View>
                <Text style={styles.headerMode}>AWARENESS MODE</Text>
                <Text style={styles.headerTitle}>INTEL</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.headerVersion}>{ECS_VERSION}</Text>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════
            INSERT TAB CHIPS — Permits & Access, Documentation, Trip Summaries
            ══════════════════════════════════════════════════ */}
        <IntelInsertTabs
          builderState={builderState}
          activeRoute={activeRoute}
          loadoutStats={loadoutStats}
          onViewDocument={handleViewDocument}
          onExportDocument={handleExportContent}
          onToast={showToast}
          riskScore={riskScore ? risk.score : null}
          riskLevel={risk.level}
          riskColor={riskColor}
          expeditions={expeditions}
        />

        {/* ══════════════════════════════════════════════════
            MAIN VIEW — Fixed panel, NO SCROLL (Safety tab model)
            ══════════════════════════════════════════════════ */}
        <View style={styles.content}>
          {/* ── Section 1: Environmental Intelligence ──── */}
          <View style={styles.contentPadded}>
            <EnvironmentalIntel
              activeRoute={activeRoute}
              riskScore={riskScore ? risk.score : null}
              riskLevel={risk.level}
              riskColor={riskColor}
            />
          </View>

          {/* ══════════════════════════════════════════════
              OPERATOR & SETTINGS (Compact Footer — pinned bottom)
              ══════════════════════════════════════════════ */}
          <View style={styles.operatorFooter}>
            <View style={styles.sectionDivider} />
            {user ? (
              <View style={styles.operatorCard}>
                <View style={styles.operatorRow}>
                  <Ionicons name="person-circle" size={24} color={TACTICAL.amber} />
                  <View style={styles.operatorInfo}>
                    <Text style={styles.operatorEmail} numberOfLines={2}>{user.email}</Text>

                    <View style={styles.operatorBadges}>
                      {operatorInfo?.role && (
                        <View style={[styles.badge, {
                          borderColor: operatorInfo.role === 'admin' ? TACTICAL.amber : '#4CAF50',
                        }]}>
                          <Text style={[styles.badgeText, {
                            color: operatorInfo.role === 'admin' ? TACTICAL.amber : '#4CAF50',
                          }]}>
                            {operatorInfo.role.toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.badge, { borderColor: '#4CAF50' }]}>
                        <View style={styles.statusDot} />
                        <Text style={[styles.badgeText, { color: '#4CAF50' }]}>
                          {operatorInfo?.status?.toUpperCase() || 'ACTIVE'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.signOutBtn}
                    onPress={async () => {
                      await signOut();
                      showToast('Session terminated');
                      router.replace('/login');
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="log-out-outline" size={14} color={TACTICAL.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.signInCard}
                onPress={() => router.push('/login')}
                activeOpacity={0.7}
              >
                <Ionicons name="log-in-outline" size={16} color={TACTICAL.amber} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.signInTitle}>SIGN IN</Text>
                  <Text style={styles.signInDesc}>Sign in to sync data and access cloud features</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            )}

            {/* ── System Footer (compact) ─────────────── */}
            <View style={styles.systemFooter}>
              <Text style={styles.footerProduct}>{ECS_PRODUCT}</Text>
              <Text style={styles.footerVersion}>{ECS_VERSION}</Text>
            </View>

          </View>
        </View>

        {/* ══════════════════════════════════════════════════
            DOCUMENT PREVIEW MODAL (Full-Screen)
            ══════════════════════════════════════════════════ */}
        <DocumentPreviewModal
          visible={docPreviewVisible}
          onClose={handleCloseDocPreview}
          documentId={docPreviewId}
          documentTitle={docPreviewTitle}
          documentCategory={docPreviewCategory}
          customContent={docPreviewContent}
          onExport={(content) => handleExportContent(content, `ecs-${docPreviewId}`)}
        />
      </View>
    </Wrapper>

  );
}

// ── Styles ───────────────────────────────────────────────────

export default function IntelScreen() {
  return (
    <TabErrorBoundary tabName="INTEL">
      <IntelScreenInner />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingBottom: 12,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    borderBottomColor: GOLD_RAIL.section,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMode: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  headerVersion: {
    fontSize: 8,
    fontWeight: '600',
    color: 'rgba(138, 138, 133, 0.5)',
    letterSpacing: 1,
    fontFamily: 'Courier',
  },

  // Content — FIXED, NO SCROLL (matches Safety tab model)
  content: {
    flex: 1,
    paddingBottom: Platform.OS === 'web' ? 80 : 100,
  },

  contentPadded: {
    flex: 1,
    padding: 16,
  },

  // Section Divider — gold subsection rail
  sectionDivider: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginBottom: 10,
  },


  // Operator Footer — pinned at bottom of content area
  operatorFooter: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },

  // Operator Section
  operatorCard: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    padding: 10,
  },
  operatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  operatorInfo: { flex: 1 },
  operatorEmail: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  operatorBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 3,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4CAF50',
  },
  signOutBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.2)',
    backgroundColor: 'rgba(192, 57, 43, 0.06)',
  },

  signInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    padding: 12,
  },
  signInTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  signInDesc: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },

  // System Footer (compact)
  systemFooter: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  footerOrg: {
    fontSize: 7,
    color: 'rgba(138, 138, 133, 0.35)',
    letterSpacing: 2,
    fontWeight: '500',
  },
  footerProduct: {
    fontSize: 11,
    color: TACTICAL.amber,
    fontWeight: '700',
    marginTop: 2,
  },
  footerVersion: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginTop: 2,
    fontFamily: 'Courier',
  },
});




