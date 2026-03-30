/**
 * ECSPopupPanel — Reusable Popup / Dialog Panel Layout
 *
 * Drop-in layout wrapper for ECS popup dialogs and modal panels.
 * Ensures content is never cut off, clipped, or hidden on any device.
 *
 * Layout structure:
 *   ┌─────────────────────────────┐
 *   │  Header (fixed, optional)   │
 *   ├─────────────────────────────┤
 *   │                             │
 *   │  Scrollable Content Body    │
 *   │                             │
 *   ├─────────────────────────────┤
 *   │  Footer (fixed, optional)   │
 *   └─────────────────────────────┘
 *
 * UI Consistency Pass:
 *   • Header padding, title font, close button — all from uiConstants
 *   • Footer padding and border — from uiConstants
 *   • Close button uses standardized CLOSE_BTN size/radius
 *   • Consistent icon-text gap in headers (DENSITY.iconTextGap)
 *   • ScrollView uses flexShrink:1 + flexGrow:1 for correct fill
 *   • contentContainer uses flexGrow:0 to prevent over-stretch
 */
import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  TouchableOpacity,
  Text,
  Pressable,
} from 'react-native';
import { TACTICAL, DENSITY, TYPO, ECS, GOLD_RAIL } from '../../lib/theme';
import {
  CLOSE_BTN,
  MODAL_HEADER,
  MODAL_FOOTER,
  SECTION,
  SAFE_AREA,
  closeBtnCircleStyle,
} from '../../lib/uiConstants';

// ── Types ────────────────────────────────────────────────────
export type PopupVariant = 'center' | 'bottom';

interface ECSPopupPanelProps {
  /** Layout variant: 'center' for dialog, 'bottom' for bottom sheet */
  variant?: PopupVariant;
  /** Fixed header content (title bar, close button, etc.) */
  header?: React.ReactNode;
  /** Scrollable body content */
  children: React.ReactNode;
  /** Fixed footer content (action buttons, etc.) */
  footer?: React.ReactNode;
  /** Maximum fraction of screen height (default: 0.85 for center, 0.92 for bottom) */
  maxHeightFraction?: number;
  /** Background color override */
  backgroundColor?: string;
  /** Border radius override */
  borderRadius?: number;
  /** Whether to wrap in KeyboardAvoidingView (default: false) */
  keyboardAware?: boolean;
  /** Max width for center variant (default: 420) */
  maxWidth?: number;
  /** Whether to show the drag handle indicator (bottom variant) */
  showHandle?: boolean;
  /** Additional style for the outer panel container */
  style?: any;
  /** Additional style for the ScrollView content container */
  contentContainerStyle?: any;
  /** Callback when backdrop is pressed (for center variant) */
  onBackdropPress?: () => void;
  /** Whether the ScrollView should persist taps */
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  /** Ref for the ScrollView */
  scrollRef?: React.RefObject<ScrollView>;
  /** Border color override */
  borderColor?: string;
  /** Whether to show border (default: true) */
  showBorder?: boolean;
  /** Whether content should be scrollable (default: true) */
  scrollable?: boolean;
}

// ── Component ────────────────────────────────────────────────
export default function ECSPopupPanel({
  variant = 'center',
  header,
  children,
  footer,
  maxHeightFraction,
  backgroundColor,
  borderRadius: borderRadiusOverride,
  keyboardAware = false,
  maxWidth = 420,
  showHandle = false,
  style,
  contentContainerStyle,
  onBackdropPress,
  keyboardShouldPersistTaps = 'handled',
  scrollRef,
  borderColor,
  showBorder = true,
  scrollable = true,
}: ECSPopupPanelProps) {
  const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

  // Default max height fractions
  const defaultMaxFraction = variant === 'center' ? 0.85 : 0.92;
  const maxFraction = maxHeightFraction ?? defaultMaxFraction;

  // Calculate available height accounting for safe areas
  const availableHeight = screenHeight - SAFE_AREA.top - SAFE_AREA.bottom;
  const panelMaxHeight = Math.min(
    availableHeight * maxFraction,
    screenHeight - SAFE_AREA.top - SAFE_AREA.bottom - 20 // Always leave 20px margin
  );

  // Styling
  const bgColor = backgroundColor ?? TACTICAL.panel;
  const radius = borderRadiusOverride ?? (variant === 'center' ? ECS.radius : 22);
  const bColor = borderColor ?? TACTICAL.border;

  // Build the panel content
  const panelContent = (
    <View
      style={[
        styles.panel,
        {
          maxHeight: panelMaxHeight,
          backgroundColor: bgColor,
          borderRadius: variant === 'center' ? radius : 0,
          borderTopLeftRadius: radius,
          borderTopRightRadius: radius,
          borderBottomLeftRadius: variant === 'center' ? radius : 0,
          borderBottomRightRadius: variant === 'center' ? radius : 0,
        },
        showBorder && {
          borderWidth: 1,
          borderColor: bColor,
        },
        variant === 'center' && {
          maxWidth,
          width: screenWidth - 40, // 20px margin on each side
          alignSelf: 'center' as const,
        },
        variant === 'bottom' && {
          width: '100%' as any,
        },
        // Shadow
        styles.panelShadow,
        style,
      ]}
    >
      {/* Drag Handle (bottom variant) */}
      {showHandle && variant === 'bottom' && (
        <View style={styles.handleContainer}>
          <View style={styles.handleBar} />
        </View>
      )}

      {/* Fixed Header */}
      {header && (
        <View style={styles.headerContainer}>
          {header}
        </View>
      )}

      {/* Scrollable Content Body */}
      {scrollable ? (
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          bounces={true}
          overScrollMode="auto"
          contentContainerStyle={[
            styles.contentContainer,
            {
              paddingBottom: footer ? 8 : (SECTION.cardPad + (variant === 'bottom' ? SAFE_AREA.bottom : 0)),
            },
            contentContainerStyle,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.nonScrollContent, contentContainerStyle]}>
          {children}
        </View>
      )}

      {/* Fixed Footer */}
      {footer && (
        <View
          style={[
            styles.footerContainer,
            {
              paddingBottom: variant === 'bottom'
                ? MODAL_FOOTER.paddingBottom + SAFE_AREA.bottom
                : MODAL_FOOTER.paddingBottom,
            },
          ]}
        >
          {footer}
        </View>
      )}
    </View>
  );

  // Wrap in KeyboardAvoidingView if needed
  const wrappedContent = keyboardAware ? (
    <KeyboardAvoidingView
      style={variant === 'center' ? styles.centerWrapper : styles.bottomWrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      pointerEvents="box-none"
    >
      {panelContent}
    </KeyboardAvoidingView>
  ) : (
    <View
      style={variant === 'center' ? styles.centerWrapper : styles.bottomWrapper}
      pointerEvents="box-none"
    >
      {panelContent}
    </View>
  );

  // For center variant, wrap with backdrop press handler
  if (variant === 'center' && onBackdropPress) {
    return (
      <Pressable
        style={styles.centerWrapper}
        onPress={onBackdropPress}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          {panelContent}
        </Pressable>
      </Pressable>
    );
  }

  return wrappedContent;
}

// ── Standard Header Component ────────────────────────────────
// Convenience header component for common modal header pattern.
// Uses standardized CLOSE_BTN and MODAL_HEADER tokens.
export function PopupHeader({
  title,
  subtitle,
  icon,
  onClose,
  titleColor,
  borderColor: headerBorderColor,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose?: () => void;
  titleColor?: string;
  borderColor?: string;
}) {
  return (
    <View style={[
      headerStyles.container,
      headerBorderColor ? { borderBottomColor: headerBorderColor } : undefined,
    ]}>
      {icon && <View style={headerStyles.iconBox}>{icon}</View>}
      <View style={headerStyles.textContainer}>
        <Text style={[headerStyles.title, titleColor ? { color: titleColor } : undefined]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={headerStyles.subtitle}>{subtitle}</Text>
        )}
      </View>
      {onClose && (
        <TouchableOpacity
          style={headerStyles.closeBtn}
          onPress={onClose}
          hitSlop={CLOSE_BTN.hitSlop}
        >
          <Text style={headerStyles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Standard Footer Component ────────────────────────────────
// Convenience footer component for common action button pattern.
export function PopupFooter({
  children,
  borderColor: footerBorderColor,
}: {
  children: React.ReactNode;
  borderColor?: string;
}) {
  return (
    <View style={[
      footerStyles.container,
      footerBorderColor ? { borderTopColor: footerBorderColor } : undefined,
    ]}>
      {children}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  centerWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  bottomWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    overflow: 'hidden',
  },
  panelShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
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
  headerContainer: {
    // Header is fixed, not scrollable
  },
  scrollView: {
    flexShrink: 1,
    flexGrow: 1,
  },
  contentContainer: {
    paddingHorizontal: SECTION.modalPad,
    paddingTop: 8,
    flexGrow: 0,
  },
  nonScrollContent: {
    paddingHorizontal: SECTION.modalPad,
    paddingTop: 8,
    flexShrink: 1,
  },
  footerContainer: {
    paddingHorizontal: MODAL_FOOTER.paddingH,
    paddingTop: MODAL_FOOTER.paddingTop,
    borderTopWidth: MODAL_FOOTER.borderTopWidth,
    borderTopColor: MODAL_FOOTER.borderTopColor,
  },
});


const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DENSITY.iconTextGap,
    paddingHorizontal: MODAL_HEADER.paddingH,
    paddingTop: MODAL_HEADER.paddingTop,
    paddingBottom: MODAL_HEADER.paddingBottom,
    borderBottomWidth: MODAL_HEADER.borderBottomWidth,
    borderBottomColor: MODAL_HEADER.borderBottomColor,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ECS.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...MODAL_HEADER.titleStyle,
    color: TACTICAL.text,
  },
  subtitle: {
    ...MODAL_HEADER.subtitleStyle,
  },
  closeBtn: {
    ...closeBtnCircleStyle,
  },
  closeBtnText: {
    fontSize: CLOSE_BTN.iconSize,
    color: TACTICAL.textMuted,
    fontWeight: '600',
  },
});

const footerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: MODAL_FOOTER.buttonGap,
    paddingHorizontal: MODAL_FOOTER.paddingH,
    paddingTop: MODAL_FOOTER.paddingTop,
    paddingBottom: MODAL_FOOTER.paddingBottom,
    borderTopWidth: MODAL_FOOTER.borderTopWidth,
    borderTopColor: MODAL_FOOTER.borderTopColor,
  },
});



