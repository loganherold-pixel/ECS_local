import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import ECSModalShell, { ECSOverlayFooter } from './ECSModalShell';
import { TACTICAL } from '../lib/theme';

interface ECSConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  destructive?: boolean;
}

export default function ECSConfirmDialog({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  icon = 'alert-circle-outline',
  destructive = false,
}: ECSConfirmDialogProps) {
  return (
    <ECSModalShell
      visible={visible}
      onClose={onCancel}
      title={title}
      subtitle={message}
      icon={icon}
      overlayClass="dialog"
      scrollable={false}
      footer={
        <ECSOverlayFooter>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
            <Text style={styles.cancelText}>{cancelLabel.toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, destructive ? styles.confirmBtnDestructive : styles.confirmBtnPrimary]}
            onPress={onConfirm}
            activeOpacity={0.8}
          >
            <Text style={[styles.confirmText, destructive ? styles.confirmTextLight : styles.confirmTextDark]}>
              {confirmLabel.toUpperCase()}
            </Text>
          </TouchableOpacity>
        </ECSOverlayFooter>
      }
    >
      <View style={styles.body}>
        <Text style={styles.helper}>
          Choose {cancelLabel.toLowerCase()} to keep the current state, or {confirmLabel.toLowerCase()} to continue.
        </Text>
      </View>
    </ECSModalShell>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 8,
  },
  helper: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.24)',
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.4,
  },
  confirmBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnPrimary: {
    backgroundColor: TACTICAL.amber,
  },
  confirmBtnDestructive: {
    backgroundColor: TACTICAL.danger,
  },
  confirmText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  confirmTextDark: {
    color: '#0B0F12',
  },
  confirmTextLight: {
    color: '#FFFFFF',
  },
});
