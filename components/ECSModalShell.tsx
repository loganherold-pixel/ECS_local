import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeIcon as Ionicons } from './SafeIcon';
import ECSModal, { type OverlayTier } from './ECSModal';
import ECSShellTexture from './ECSShellTexture';
import {
  ECS_TOP_SHELL_COMMAND_PILL_HEIGHT,
  getShellBottomClearance,
  getShellHeaderTopPadding,
} from '../lib/shellLayout';
import { useAdaptiveLayout } from '../lib/useAdaptiveLayout';
import type { OverlayStackBehavior } from '../lib/overlayCoordinator';
import { EASING, MOTION } from '../lib/motion';
import { useTheme } from '../context/ThemeContext';
import { resolveEcsPopupSurfaceTheme } from '../lib/theme';

export type ECSOverlayClass = 'workflow' | 'editor' | 'action' | 'dialog' | 'info' | 'support';

type OverlayPreset = {
  layout: 'sheet' | 'dialog';
  maxHeightFraction: number;
  minHeightFraction?: number;
  maxWidth: number;
  showHandle: boolean;
  allowSwipeDismiss: boolean;
  dismissOnBackdrop: boolean;
  scrollable: boolean;
  keyboardAware: boolean;
};

const OVERLAY_PRESETS: Record<ECSOverlayClass, OverlayPreset> = {
  workflow: {
    layout: 'sheet',
    maxHeightFraction: 0.94,
    minHeightFraction: 0.86,
    maxWidth: 980,
    showHandle: false,
    allowSwipeDismiss: false,
    dismissOnBackdrop: false,
    scrollable: false,
    keyboardAware: false,
  },
  editor: {
    layout: 'sheet',
    maxHeightFraction: 0.82,
    minHeightFraction: 0.72,
    maxWidth: 920,
    showHandle: true,
    allowSwipeDismiss: true,
    dismissOnBackdrop: true,
    scrollable: true,
    keyboardAware: true,
  },
  action: {
    layout: 'sheet',
    maxHeightFraction: 0.56,
    maxWidth: 760,
    showHandle: true,
    allowSwipeDismiss: true,
    dismissOnBackdrop: true,
    scrollable: true,
    keyboardAware: false,
  },
  dialog: {
    layout: 'dialog',
    maxHeightFraction: 0.46,
    maxWidth: 430,
    showHandle: false,
    allowSwipeDismiss: false,
    dismissOnBackdrop: true,
    scrollable: false,
    keyboardAware: false,
  },
  info: {
    layout: 'dialog',
    maxHeightFraction: 0.62,
    maxWidth: 760,
    showHandle: false,
    allowSwipeDismiss: false,
    dismissOnBackdrop: true,
    scrollable: true,
    keyboardAware: false,
  },
  support: {
    layout: 'dialog',
    maxHeightFraction: 0.58,
    maxWidth: 460,
    showHandle: false,
    allowSwipeDismiss: true,
    dismissOnBackdrop: true,
    scrollable: true,
    keyboardAware: false,
  },
};

const BASE_SIDE_CLEARANCE = 12;

export interface ECSModalShellProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  subtitle?: string;
  eyebrow?: string;
  footer?: React.ReactNode;
  tier?: OverlayTier;
  stackBehavior?: OverlayStackBehavior;
  overlayClass?: ECSOverlayClass;
  maxWidth?: number;
  maxHeightFraction?: number;
  minHeightFraction?: number;
  scrollable?: boolean;
  keyboardAware?: boolean;
  dismissOnBackdrop?: boolean;
  allowSwipeDismiss?: boolean;
  showHandle?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  headerRight?: React.ReactNode;
  onBack?: () => void;
  closeGuardKey?: string | number | boolean | null;
  topClearanceOverride?: number;
  bottomClearanceOverride?: number;
}

export function ECSOverlayFooter({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.footerRow, style]}>{children}</View>;
}

export default function ECSModalShell({
  visible,
  onClose,
  title,
  children,
  icon = 'albums-outline',
  subtitle,
  eyebrow,
  footer,
  tier = 'global',
  stackBehavior = 'replace',
  overlayClass = 'editor',
  maxWidth,
  maxHeightFraction,
  minHeightFraction,
  scrollable,
  keyboardAware,
  dismissOnBackdrop,
  allowSwipeDismiss,
  showHandle,
  contentContainerStyle,
  bodyStyle,
  titleStyle,
  headerRight,
  onBack,
  closeGuardKey,
  topClearanceOverride,
  bottomClearanceOverride,
}: ECSModalShellProps) {
  const preset = OVERLAY_PRESETS[overlayClass] ?? OVERLAY_PRESETS.editor;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const { palette, colors, effectiveTheme } = useTheme();
  const translateY = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const surfaceTheme = useMemo(() => resolveEcsPopupSurfaceTheme(effectiveTheme), [effectiveTheme]);

  const adaptiveMaxWidth =
    preset.layout === 'dialog'
      ? adaptive.overlay.dialogMaxWidth
      : adaptive.overlay.sheetMaxWidth;
  const resolvedMaxWidth = maxWidth ?? Math.max(preset.maxWidth, adaptiveMaxWidth ?? preset.maxWidth);
  const resolvedMaxHeightFraction = maxHeightFraction ?? preset.maxHeightFraction;
  const resolvedMinHeightFraction = minHeightFraction ?? preset.minHeightFraction;
  const resolvedScrollable = scrollable ?? preset.scrollable;
  const resolvedKeyboardAware = keyboardAware ?? preset.keyboardAware;
  const resolvedDismissOnBackdrop = dismissOnBackdrop ?? preset.dismissOnBackdrop;
  const resolvedAllowSwipeDismiss = allowSwipeDismiss ?? preset.allowSwipeDismiss;
  const resolvedShowHandle = showHandle ?? preset.showHandle;
  const sideClearance = Math.max(BASE_SIDE_CLEARANCE, adaptive.overlay.sideClearance);
  const isExpanded = adaptive.isExpanded;
  const headerPaddingHorizontal = adaptive.overlay.headerPaddingHorizontal;
  const headerPaddingVertical = adaptive.overlay.headerPaddingVertical;
  const bodyPadding = adaptive.overlay.bodyPadding;
  const footerPaddingHorizontal = adaptive.overlay.footerPaddingHorizontal;
  const controlSize = adaptive.overlay.controlSize;
  const iconGlyphSize = adaptive.overlay.iconGlyphSize;
  const actionGlyphSize = adaptive.overlay.actionGlyphSize;
  const isWorkflowSheet = overlayClass === 'workflow' && preset.layout === 'sheet';
  const isFullBodySheet =
    preset.layout === 'sheet' &&
    (resolvedMaxHeightFraction >= 1 || (resolvedMinHeightFraction ?? 0) >= 1);

  const defaultTopClearance = Platform.OS === 'web'
    ? 22
    : isFullBodySheet
      ? getShellHeaderTopPadding(insets.top) +
        ECS_TOP_SHELL_COMMAND_PILL_HEIGHT +
        (isWorkflowSheet ? 10 : 8)
      : Math.max(
        insets.top + (isExpanded ? (isWorkflowSheet ? 12 : 18) : (isWorkflowSheet ? 6 : 10)),
        preset.layout === 'dialog' ? 18 : (isWorkflowSheet ? 8 : 12),
      );
  const defaultBottomClearance = preset.layout === 'sheet'
    ? getShellBottomClearance(
      insets.bottom,
      isExpanded ? (isWorkflowSheet ? 10 : 18) : (isWorkflowSheet ? 2 : 10),
    )
    : Math.max(insets.bottom + 18, 20);
  const topClearance = typeof topClearanceOverride === 'number'
    ? topClearanceOverride
    : defaultTopClearance;
  const bottomClearance = typeof bottomClearanceOverride === 'number'
    ? bottomClearanceOverride
    : defaultBottomClearance;
  const availableHeight = Math.max(320, height - topClearance - bottomClearance);
  const shellMaxHeight = Math.min(availableHeight, Math.round(height * resolvedMaxHeightFraction));
  const shellMinHeight = typeof resolvedMinHeightFraction === 'number'
    ? Math.min(shellMaxHeight, Math.max(260, Math.round(availableHeight * resolvedMinHeightFraction)))
    : undefined;
  const widthAllowance = width - sideClearance * 2;
  const expandedWidthBias =
    preset.layout === 'sheet' && isExpanded ? adaptive.overlay.expandedWidthBias : 0;
  const shellWidth = Math.min(
    Math.max(resolvedMaxWidth, 280),
    Math.max(280, widthAllowance - expandedWidthBias),
  );

  useEffect(() => {
    if (!visible) {
      closingRef.current = false;
      translateY.stopAnimation();
      translateY.setValue(0);
    }
  }, [translateY, visible]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
    }
  }, [closeGuardKey, visible]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

  const panResponder = useMemo(() => {
    if (preset.layout !== 'sheet' || !resolvedAllowSwipeDismiss) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(Math.min(gestureState.dy, shellMaxHeight));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 90 || gestureState.vy > 0.8) {
          requestClose();
          return;
        }

        Animated.timing(translateY, {
          toValue: 0,
          duration: MOTION.stateTransition,
          easing: EASING.standard,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.timing(translateY, {
          toValue: 0,
          duration: MOTION.stateTransition,
          easing: EASING.standard,
          useNativeDriver: true,
        }).start();
      },
    });
  }, [preset.layout, requestClose, resolvedAllowSwipeDismiss, shellMaxHeight, translateY]);

  const bodyPaddingBottom = footer
    ? bodyPadding + (isWorkflowSheet ? 2 : 6)
    : bodyPadding + 14 + (preset.layout === 'sheet' ? insets.bottom : 0);
  const footerPaddingBottom = 14 + (preset.layout === 'sheet' ? insets.bottom : 0);
  const headerMinHeight = Math.max(58, controlSize + headerPaddingVertical * 2);

  const shellContent = (
    <Animated.View
      style={[
        styles.shell,
        preset.layout === 'sheet' ? styles.sheetShell : styles.dialogShell,
        {
          width: shellWidth,
          maxHeight: shellMaxHeight,
          minHeight: shellMinHeight,
          transform: [{ translateY }],
          backgroundColor: surfaceTheme.shellBg,
          borderColor: surfaceTheme.shellBorder,
        },
      ]}
    >
      <ECSShellTexture />
      {resolvedShowHandle && preset.layout === 'sheet' ? (
        <View
          style={[styles.handleZone, { backgroundColor: surfaceTheme.handleBg }]}
          {...(panResponder?.panHandlers ?? {})}
        >
          <View style={[styles.handleBar, { backgroundColor: surfaceTheme.handleBar }]} />
        </View>
      ) : null}

      <View
        style={[
          styles.header,
          {
            minHeight: headerMinHeight,
            paddingHorizontal: headerPaddingHorizontal,
            paddingVertical: headerPaddingVertical,
            backgroundColor: surfaceTheme.headerBg,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          {onBack ? (
            <TouchableOpacity
              style={[
                styles.backBtn,
                {
                  width: controlSize,
                  height: controlSize,
                  borderRadius: Math.round(controlSize * 0.28),
                  backgroundColor: surfaceTheme.controlBg,
                  borderColor: surfaceTheme.controlBorder,
                },
              ]}
              onPress={onBack}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="arrow-back" size={iconGlyphSize} color={palette.textMuted} />
            </TouchableOpacity>
          ) : null}

          <View
            style={[
              styles.iconWrap,
              {
                width: controlSize,
                height: controlSize,
                borderRadius: Math.round(controlSize * 0.3),
                backgroundColor: `${palette.amber}14`,
                borderColor: `${palette.amber}30`,
              },
            ]}
          >
            <Ionicons name={icon} size={iconGlyphSize} color={palette.amber} />
          </View>

          <View style={styles.titleCopy}>
            {eyebrow ? (
              <Text style={[styles.eyebrow, { fontSize: adaptive.overlay.eyebrowSize, color: palette.textMuted }]}>{eyebrow}</Text>
            ) : null}
            <Text style={[styles.title, { fontSize: adaptive.overlay.titleSize, color: palette.amber }, titleStyle]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { fontSize: adaptive.overlay.subtitleSize, color: colors.textSecondary }]} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.headerActions}>
          {headerRight}
          <TouchableOpacity
            style={[
              styles.closeBtn,
              {
                width: controlSize,
                height: controlSize,
                borderRadius: Math.round(controlSize * 0.28),
                backgroundColor: surfaceTheme.controlBg,
                borderColor: surfaceTheme.controlBorder,
              },
            ]}
            onPress={requestClose}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={actionGlyphSize} color={palette.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: surfaceTheme.divider }]} />

      {resolvedScrollable ? (
        <ScrollView
          style={[styles.scrollView, bodyStyle]}
          contentContainerStyle={[
            styles.bodyContent,
            {
              padding: bodyPadding,
              paddingTop: bodyPadding,
              paddingBottom: bodyPaddingBottom,
            },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={preset.layout !== 'dialog'}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.bodyStatic,
            {
              padding: bodyPadding,
            },
            bodyStyle,
            contentContainerStyle,
          ]}
        >
          {children}
        </View>
      )}

      {footer ? (
        <>
          <View style={[styles.divider, { backgroundColor: surfaceTheme.divider }]} />
          <View
            style={[
              styles.footer,
              {
                paddingHorizontal: footerPaddingHorizontal,
                paddingBottom: footerPaddingBottom,
                backgroundColor: surfaceTheme.footerBg,
              },
            ]}
          >
            {footer}
          </View>
        </>
      ) : null}
    </Animated.View>
  );

  const shell = resolvedKeyboardAware ? (
    <KeyboardAvoidingView
      style={styles.keyboardWrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      pointerEvents="box-none"
    >
      {shellContent}
    </KeyboardAvoidingView>
  ) : shellContent;

  return (
    <ECSModal
      visible={visible}
      onClose={requestClose}
      tier={tier}
      stackBehavior={stackBehavior}
      dismissOnBackdrop={resolvedDismissOnBackdrop}
    >
      <View
        style={[
          styles.root,
          preset.layout === 'sheet' ? styles.rootSheet : styles.rootDialog,
          {
            paddingHorizontal: sideClearance,
            paddingTop: topClearance,
            paddingBottom: bottomClearance,
          },
        ]}
        pointerEvents="box-none"
      >
        {shell}
      </View>
    </ECSModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: BASE_SIDE_CLEARANCE,
    alignItems: 'center',
  },
  rootSheet: {
    justifyContent: 'flex-end',
  },
  rootDialog: {
    justifyContent: 'center',
  },
  shell: {
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    backgroundColor: 'rgba(8,12,15,0.985)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 20,
  },
  sheetShell: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  dialogShell: {
    borderRadius: 18,
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: 'rgba(10,13,16,0.98)',
  },
  handleBar: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(12,16,20,0.98)',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 2,
  },
  title: {
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  subtitle: {
    lineHeight: 14,
    marginTop: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  divider: {
    height: 1,
  },
  scrollView: {
    flex: 1,
    minHeight: 0,
  },
  bodyContent: {
    flexGrow: 1,
  },
  bodyStatic: {
    flex: 1,
    minHeight: 0,
  },
  footer: {
    paddingTop: 12,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  keyboardWrap: {
    width: '100%',
    alignItems: 'center',
  },
});
