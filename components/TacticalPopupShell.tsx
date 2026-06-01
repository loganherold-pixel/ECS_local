import React from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import ECSModalShell, { type ECSOverlayClass } from './ECSModalShell';
import type { OverlayTier } from './ECSModal';
import type { OverlayStackBehavior } from '../lib/overlayCoordinator';

interface TacticalPopupShellProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: React.ComponentProps<typeof ECSModalShell>['icon'];
  children: React.ReactNode;
  eyebrow?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  tier?: OverlayTier;
  stackBehavior?: OverlayStackBehavior;
  maxWidth?: number;
  maxHeightFraction?: number;
  minHeightFraction?: number;
  scrollable?: boolean;
  keyboardAware?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  overlayClass?: ECSOverlayClass;
  dismissOnBackdrop?: boolean;
  allowSwipeDismiss?: boolean;
  showHandle?: boolean;
  topClearanceOverride?: number;
  bottomClearanceOverride?: number;
  headerRight?: React.ReactNode;
  onBack?: () => void;
}

export default function TacticalPopupShell({
  visible,
  onClose,
  title,
  icon,
  children,
  eyebrow,
  subtitle,
  footer,
  tier = 'global',
  stackBehavior = 'replace',
  maxWidth,
  maxHeightFraction,
  minHeightFraction,
  scrollable = true,
  keyboardAware,
  contentContainerStyle,
  bodyStyle,
  titleStyle,
  overlayClass = 'editor',
  dismissOnBackdrop,
  allowSwipeDismiss,
  showHandle,
  topClearanceOverride,
  bottomClearanceOverride,
  headerRight,
  onBack,
}: TacticalPopupShellProps) {
  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title={title}
      icon={icon}
      eyebrow={eyebrow}
      subtitle={subtitle}
      footer={footer}
      tier={tier}
      stackBehavior={stackBehavior}
      maxWidth={maxWidth}
      maxHeightFraction={maxHeightFraction}
      minHeightFraction={minHeightFraction}
      scrollable={scrollable}
      keyboardAware={keyboardAware}
      contentContainerStyle={contentContainerStyle}
      bodyStyle={bodyStyle}
      titleStyle={titleStyle}
      overlayClass={overlayClass}
      dismissOnBackdrop={dismissOnBackdrop}
      allowSwipeDismiss={allowSwipeDismiss}
      showHandle={showHandle}
      topClearanceOverride={topClearanceOverride}
      bottomClearanceOverride={bottomClearanceOverride}
      headerRight={headerRight}
      onBack={onBack}
    >
      {children}
    </ECSModalShell>
  );
}
