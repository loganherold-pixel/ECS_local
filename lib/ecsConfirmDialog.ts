import { Alert, Platform } from 'react-native';

export type ECSConfirmDialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function showEcsConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
}: ECSConfirmDialogOptions) {
  if (Platform.OS === 'web') {
    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm(`${title}\n\n${message}`)
        : true;
    if (confirmed) {
      void onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
}
