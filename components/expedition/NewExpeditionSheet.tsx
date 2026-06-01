// ============================================================
// NEW EXPEDITION SHEET — Phase 3: Template Containment
// ============================================================
// Bottom sheet with two options:
//   1. Blank Expedition → clears draft, navigates to wizard
//   2. Use Template → shows simple template list
//      Selecting a template prefills wizard draft → Step 1
//
// Rules:
//   • Templates are NEVER shown on the landing screen
//   • This sheet is the ONLY entry point for template usage
//   • No visual overload — simple list, not grid
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Animated, Dimensions, ActivityIndicator, FlatList,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import { templateStore, type ExpeditionTemplate } from '../../lib/templateStore';
import {
  clearWizardDraft,
  setWizardDraft,
} from '../../lib/expeditionCache';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = Math.min(SCREEN_HEIGHT * 0.55, 480);

interface NewExpeditionSheetProps {
  visible: boolean;
  onClose: () => void;
}

type SheetView = 'options' | 'templates';

export default function NewExpeditionSheet({ visible, onClose }: NewExpeditionSheetProps) {
  const router = useRouter();
  const { user, showToast } = useApp();

  const [view, setView] = useState<SheetView>('options');
  const [templates, setTemplates] = useState<ExpeditionTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const slideAnim = useRef(new Animated.Value(SHEET_MAX_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Animate in/out ─────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setView('options');
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SHEET_MAX_HEIGHT,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  // ── Close with animation ───────────────────────────────────
  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: SHEET_MAX_HEIGHT,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [onClose, fadeAnim, slideAnim]);

  // ── Blank Expedition ───────────────────────────────────────
  const handleBlankExpedition = useCallback(() => {
    clearWizardDraft();
    handleClose();
    // Small delay to let the sheet animate out before navigation
    setTimeout(() => {
      router.push('/expedition-wizard' as any);
    }, 180);
  }, [handleClose, router]);

  // ── Use Template — load template list ──────────────────────
  const handleUseTemplate = useCallback(async () => {
    setView('templates');
    setLoadingTemplates(true);

    try {
      const list = await templateStore.list(user?.id);
      setTemplates(list);
    } catch (e) {
      console.warn('[NewExpeditionSheet] Failed to load templates:', e);
      setTemplates([]);
    }

    setLoadingTemplates(false);
  }, [user?.id]);

  // ── Select a template → prefill draft → navigate ──────────
  const handleSelectTemplate = useCallback(async (template: ExpeditionTemplate) => {
    // Record usage
    try {
      await templateStore.recordUse(template.id, user?.id);
    } catch {}

    // Clear any existing draft, then set new one from template
    clearWizardDraft();

    // Map template fields → wizard draft fields
    setWizardDraft({
      step: 0, // Always start at Step 1 (Basics)
      name: template.name || '',
      destination: '', // Templates don't have destination — user must fill this
      startDate: '',
      endDate: '',
      notes: template.description || '',
      vehicleId: template.vehicle_id || null,
      vehicleName: template.vehicle_name || null,
      terrain: template.framework_type || null,
      systemsData: {},
    });

    handleClose();

    // Navigate to wizard after sheet closes
    setTimeout(() => {
      router.push('/expedition-wizard' as any);
    }, 180);

    showToast?.(`TEMPLATE APPLIED: ${template.name}`);
  }, [user?.id, handleClose, router, showToast]);

  // ── Back to options view ───────────────────────────────────
  const handleBackToOptions = useCallback(() => {
    setView('options');
  }, []);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle bar */}
        <View style={styles.handleBar}>
          <View style={styles.handle} />
        </View>

        {/* ═══ OPTIONS VIEW ═══════════════════════════════════ */}
        {view === 'options' && (
          <View style={styles.optionsContainer}>
            {/* Sheet Title */}
            <Text style={styles.sheetTitle}>NEW EXPEDITION</Text>
            <Text style={styles.sheetSubtitle}>
              Choose how to start your expedition plan
            </Text>

            {/* Option Cards */}
            <View style={styles.optionCards}>
              {/* Blank Expedition */}
              <TouchableOpacity
                style={styles.optionCard}
                onPress={handleBlankExpedition}
                activeOpacity={0.7}
              >
                <View style={styles.optionIconContainer}>
                  <Ionicons name="add-circle-outline" size={28} color={TACTICAL.amber} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>BLANK EXPEDITION</Text>
                  <Text style={styles.optionDesc}>
                    Start from scratch with an empty plan
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>

              {/* Use Template */}
              <TouchableOpacity
                style={styles.optionCard}
                onPress={handleUseTemplate}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIconContainer, { backgroundColor: 'rgba(62, 79, 60, 0.15)' }]}>
                  <Ionicons name="copy-outline" size={26} color={TACTICAL.accent} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>USE TEMPLATE</Text>
                  <Text style={styles.optionDesc}>
                    Start from a saved expedition template
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Cancel */}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ TEMPLATES VIEW ═════════════════════════════════ */}
        {view === 'templates' && (
          <View style={styles.templatesContainer}>
            {/* Header with back */}
            <View style={styles.templatesHeader}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={handleBackToOptions}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={18} color={TACTICAL.text} />
              </TouchableOpacity>
              <Text style={styles.templatesTitle}>SELECT TEMPLATE</Text>
              <View style={{ width: 36 }} />
            </View>

            {/* Loading */}
            {loadingTemplates && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={TACTICAL.accent} />
                <Text style={styles.loadingText}>Loading templates...</Text>
              </View>
            )}

            {/* Empty State */}
            {!loadingTemplates && templates.length === 0 && (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-outline" size={32} color={TACTICAL.textMuted} style={{ opacity: 0.4 }} />
                <Text style={styles.emptyTitle}>NO TEMPLATES</Text>
                <Text style={styles.emptyDesc}>
                  You haven't saved any expedition templates yet.{'\n'}
                  Complete an expedition to save it as a template.
                </Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={handleBlankExpedition}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle-outline" size={16} color={TACTICAL.amber} />
                  <Text style={styles.emptyBtnText}>START BLANK INSTEAD</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Template List */}
            {!loadingTemplates && templates.length > 0 && (
              <FlatList
                data={templates}
                keyExtractor={(item) => item.id}
                style={styles.templateList}
                contentContainerStyle={styles.templateListContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.templateRow}
                    onPress={() => handleSelectTemplate(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.templateRowLeft}>
                      <View style={styles.templateIcon}>
                        <Ionicons name="document-text-outline" size={16} color={TACTICAL.amber} />
                      </View>
                      <View style={styles.templateInfo}>
                        <Text style={styles.templateName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.templateDesc} numberOfLines={1}>
                          {item.description || buildAutoDescription(item)}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.templateSeparator} />}
              />
            )}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

// ── Helper: auto-generate description from template data ─────
function buildAutoDescription(template: ExpeditionTemplate): string {
  const parts: string[] = [];
  if (template.vehicle_name) parts.push(template.vehicle_name);
  if (template.framework_type) parts.push(template.framework_type);
  if (template.trip_length_days) parts.push(`${template.trip_length_days} days`);
  if (template.items_snapshot?.length) parts.push(`${template.items_snapshot.length} items`);
  return parts.length > 0 ? parts.join(' · ') : 'No details';
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },

  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SHEET_MAX_HEIGHT,
    backgroundColor: '#12181D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    overflow: 'hidden',
  },

  handleBar: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(138, 138, 133, 0.3)',
  },

  // ── Options View ───────────────────────────────────────────
  optionsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },

  optionCards: {
    gap: 10,
    marginBottom: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  optionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
  },
  optionTextContainer: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  optionDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },

  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  // ── Templates View ─────────────────────────────────────────
  templatesContainer: {
    flex: 1,
    maxHeight: SHEET_MAX_HEIGHT - 60,
  },
  templatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  templatesTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  emptyDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    marginTop: 8,
  },
  emptyBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // Template List
  templateList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  templateListContent: {
    paddingBottom: 8,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  templateRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  templateIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
  },
  templateInfo: {
    flex: 1,
    gap: 2,
  },
  templateName: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  templateDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
  templateSeparator: {
    height: 6,
  },
});





