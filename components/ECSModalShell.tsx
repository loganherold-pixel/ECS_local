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
import { TACTICAL } from '../lib/theme';
import { getShellBottomClearance } from '../lib/shellLayout';
import { useAdaptiveLayout } from '../lib/useAdaptiveLayout';
import type { OverlayStackBehavior } from '../lib/overlayCoordinator';
import { EASING, MOTION } from '../lib/motion';

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
    maxHeightFraction: 0.88,
    minHeightFraction: 0.72,
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
}: ECSModalShellProps) {
  const preset = OVERLAY_PRESETS[overlayClass] ?? OVERLAY_PRESETS.editor;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const translateY = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

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

  const topClearance = Platform.OS === 'web'
    ? 22
    : Math.max(insets.top + (isExpanded ? 18 : 10), preset.layout === 'dialog' ? 18 : 12);
  const bottomClearance = preset.layout === 'sheet'
    ? getShellBottomClearance(insets.bottom, isExpanded ? 18 : 10)
    : Math.max(insets.bottom + 18, 20);
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

  const handleDismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(translateY, {
      toValue: shellMaxHeight + 48,
      duration: MOTION.modalDismiss,
      easing: EASING.accelerate,
      useNativeDriver: true,
    }).start(() => {
      closingRef.current = false;
      onClose();
    });
  }, [onClose, shellMaxHeight, translateY]);

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
          handleDismiss();
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
  }, [handleDismiss, preset.layout, resolvedAllowSwipeDismiss, shellMaxHeight, translateY]);

  const bodyPaddingBottom = footer
    ? bodyPadding + 6
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
        },
      ]}
    >
      {resolvedShowHandle && preset.layout === 'sheet' ? (
        <View style={styles.handleZone} {...(panResponder?.panHandlers ?? {})}>
          <View style={styles.handleBar} />
        </View>
      ) : null}

      <View
        style={[
          styles.header,
          {
            minHeight: headerMinHeight,
            paddingHorizontal: headerPaddingHorizontal,
            paddingVertical: headerPaddingVertical,
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
                },
              ]}
              onPress={onBack}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="arrow-back" size={iconGlyphSize} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          ) : null}

          <View
            style={[
              styles.iconWrap,
              {
                width: controlSize,
                height: controlSize,
                borderRadius: Math.round(controlSize * 0.3),
              },
            ]}
          >
            <Ionicons name={icon} size={iconGlyphSize} color={TACTICAL.amber} />
          </View>

          <View style={styles.titleCopy}>
            {eyebrow ? (
              <Text style={[styles.eyebrow, { fontSize: adaptive.overlay.eyebrowSize }]}>{eyebrow}</Text>
            ) : null}
            <Text style={[styles.title, { fontSize: adaptive.overlay.titleSize }, titleStyle]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { fontSize: adaptive.overlay.subtitleSize }]} numberOfLines={2}>
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
              },
            ]}
            onPress={resolvedAllowSwipeDismiss ? handleDismiss : onClose}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={actionGlyphSize} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.divider} />

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
          <View style={styles.divider} />
          <View
            style={[
              styles.footer,
              {
                paddingHorizontal: footerPaddingHorizontal,
                paddingBottom: footerPaddingBottom,
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
      onClose={resolvedAllowSwipeDismiss ? handleDismiss : onClose}
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
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.24)',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    backgroundColor: 'rgba(196,138,44,0.10)',
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: TACTICAL.textMuted,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 2,
  },
  title: {
    color: TACTICAL.amber,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  subtitle: {
    color: TACTICAL.textMuted,
    lineHeight: 14,
    marginTop: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.25)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(196,138,44,0.16)',
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
    backgroundColor: 'rgba(10,13,16,0.94)',
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
