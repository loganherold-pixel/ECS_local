/**
 * ECSBottomSheet — Shared Bottom Sheet Layout Component
 *
 * Reusable layout wrapper for ECS bottom sheets and modal panels.
 * Ensures content is never cut off at the bottom of the screen.
 *
 * UI Consistency Pass:
 *   • Handle, header, footer padding — from uiConstants tokens
 *   • Content padding — from SECTION tokens
 *   • Footer border — from MODAL_FOOTER tokens
 *   • Consistent with ECSPopupPanel styling
 */
import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import ECSShellTexture from '../ECSShellTexture';
import { useSheetLayout } from '../../lib/useSheetLayout';
import { MODAL_HEADER, MODAL_FOOTER, SECTION, SAFE_AREA } from '../../lib/uiConstants';

// ── Props ────────────────────────────────────────────────────
interface ECSBottomSheetProps {
  /** Fixed header content (title bar, tabs, etc.) — not scrollable */
  header?: React.ReactNode;
  /** Scrollable body content */
  children: React.ReactNode;
  /** Fixed footer content (action buttons, etc.) — not scrollable */
  footer?: React.ReactNode;
  /** Override max fraction of screen height (default 0.84) */
  maxFraction?: number;
  /** Override min fraction of screen height (default 0.55) */
  minFraction?: number;
  /** Override background color */
  backgroundColor?: string;
  /** Override border top radius */
  borderRadius?: number;
  /** Whether to wrap in KeyboardAvoidingView (default false) */
  keyboardAware?: boolean;
  /** Additional style for the outer sheet container */
  style?: any;
  /** Additional style for the ScrollView content container */
  contentContainerStyle?: any;
  /** Whether the ScrollView should persist taps (for forms) */
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  /** Ref for the ScrollView */
  scrollRef?: React.RefObject<ScrollView>;
  /** Whether to show the drag handle indicator */
  showHandle?: boolean;
  /** Border top color override */
  borderColor?: string;
}

// ── Component ────────────────────────────────────────────────
export default function ECSBottomSheet({
  header,
  children,
  footer,
  maxFraction = 0.84,
  minFraction = 0.55,
  backgroundColor = '#0B0F14',
  borderRadius = 26,
  keyboardAware = false,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  scrollRef,
  showHandle = false,
  borderColor,
}: ECSBottomSheetProps) {
  const {
    sheetMaxHeight,
    contentBottomPadding,
    safeBottom,
  } = useSheetLayout({
    maxFraction,
    minFraction,
  });

  const sheetContent = (
    <View
      style={[
        styles.sheet,
        {
          maxHeight: sheetMaxHeight,
          minHeight: sheetMaxHeight * (minFraction / maxFraction),
          backgroundColor,
          borderTopLeftRadius: borderRadius,
          borderTopRightRadius: borderRadius,
        },
        borderColor ? { borderTopWidth: 2, borderLeftWidth: 1, borderRightWidth: 1, borderColor } : undefined,
        style,
      ]}
    >
      <ECSShellTexture />
      {/* Drag Handle */}
      {showHandle && (
        <View style={styles.handleContainer}>
          <View style={styles.handleBar} />
        </View>
      )}

      {/* Fixed Header */}
      {header && <View style={styles.header}>{header}</View>}

      {/* Scrollable Content */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        bounces={true}
        overScrollMode="auto"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: footer ? 20 : (20 + safeBottom) },
          contentContainerStyle,
        ]}
      >
        {children}
      </ScrollView>

      {/* Fixed Footer */}
      {footer && (
        <View
          style={[
            styles.footer,
            { paddingBottom: MODAL_FOOTER.paddingBottom + safeBottom },
          ]}
        >
          {footer}
        </View>
      )}
    </View>
  );

  if (keyboardAware) {
    return (
      <KeyboardAvoidingView
        style={styles.keyboardWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        {sheetContent}
      </KeyboardAvoidingView>
    );
  }

  return sheetContent;
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  sheet: {
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: MODAL_HEADER.handlePaddingTop,
    paddingBottom: MODAL_HEADER.handlePaddingBottom,
  },
  handleBar: {
    width: MODAL_HEADER.handleWidth,
    height: MODAL_HEADER.handleHeight,
    borderRadius: MODAL_HEADER.handleRadius,
    backgroundColor: MODAL_HEADER.handleColor,
  },
  header: {
    paddingHorizontal: SECTION.modalPad,
    paddingTop: MODAL_HEADER.paddingTop,
    paddingBottom: MODAL_HEADER.paddingBottom,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SECTION.modalPad,
    paddingTop: 10,
  },
  footer: {
    paddingHorizontal: MODAL_FOOTER.paddingH,
    paddingTop: MODAL_FOOTER.paddingTop,
    borderTopWidth: MODAL_FOOTER.borderTopWidth,
    borderTopColor: MODAL_FOOTER.borderTopColor,
  },
  keyboardWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});



