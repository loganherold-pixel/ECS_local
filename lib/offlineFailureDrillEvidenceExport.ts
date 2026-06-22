import { Platform } from 'react-native';

import {
  type OfflineFailureDrillEvidenceCaptureBundle,
} from './offlineFailureDrillEvidenceCapture';
import { copyTextToClipboard } from './clipboard';
import {
  fsEnsureDir,
  fsGetInfo,
  fsWriteString,
  getDocumentDirectory,
} from './fsCompat';

export type OfflineFailureDrillEvidenceExportAction = 'share' | 'save' | 'copy';

export interface OfflineFailureDrillEvidenceExportResult {
  ok: boolean;
  action: OfflineFailureDrillEvidenceExportAction;
  uri?: string;
  filename: string;
  message: string;
  unavailableReason?: string;
}

const EXPORT_DIR = 'ecs-offline-failure-drill-evidence/';

function captureFileName(bundle: OfflineFailureDrillEvidenceCaptureBundle): string {
  const timestamp = bundle.capturedAt.replace(/[:.]/g, '-').replace(/[^0-9A-Za-z-]/g, '').slice(0, 24);
  const safeCaptureId = (bundle.captureId || 'offline-failure-drill-capture')
    .replace(/[^0-9A-Za-z._-]/g, '-')
    .slice(0, 96);
  return `${safeCaptureId}-${timestamp}.json`;
}

function serializeBundle(bundle: OfflineFailureDrillEvidenceCaptureBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

function webDownloadBundle(bundle: OfflineFailureDrillEvidenceCaptureBundle, filename: string): OfflineFailureDrillEvidenceExportResult {
  if (typeof document === 'undefined') {
    return {
      ok: false,
      action: 'save',
      filename,
      message: 'Offline Failure Drill evidence capture could not be downloaded.',
      unavailableReason: 'Browser document API is unavailable.',
    };
  }

  try {
    const blob = new Blob([serializeBundle(bundle)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    }, 100);
    return {
      ok: true,
      action: 'save',
      filename,
      message: 'Offline Failure Drill evidence capture downloaded.',
    };
  } catch (error) {
    return {
      ok: false,
      action: 'save',
      filename,
      message: 'Offline Failure Drill evidence capture could not be downloaded.',
      unavailableReason: error instanceof Error ? error.message : 'Unknown browser download error.',
    };
  }
}

export async function saveOfflineFailureDrillEvidenceCaptureBundle(
  bundle: OfflineFailureDrillEvidenceCaptureBundle,
): Promise<OfflineFailureDrillEvidenceExportResult> {
  const filename = captureFileName(bundle);

  if (Platform.OS === 'web') {
    return webDownloadBundle(bundle, filename);
  }

  try {
    const documentDir = await getDocumentDirectory();
    if (!documentDir) {
      return {
        ok: false,
        action: 'save',
        filename,
        message: 'Offline Failure Drill evidence capture could not be saved on this device.',
        unavailableReason: 'File storage is unavailable.',
      };
    }

    const directoryUri = `${documentDir}${EXPORT_DIR}`;
    const directoryReady = await fsEnsureDir(directoryUri);
    if (!directoryReady) {
      return {
        ok: false,
        action: 'save',
        filename,
        message: 'Offline Failure Drill evidence capture could not be saved.',
        unavailableReason: `Could not create ECS evidence folder: ${directoryUri}`,
      };
    }

    const uri = `${directoryUri}${filename}`;
    await fsWriteString(uri, serializeBundle(bundle), 'utf8');
    const info = await fsGetInfo(uri);
    if (!info.exists || info.isDirectory || info.size <= 0) {
      return {
        ok: false,
        action: 'save',
        filename,
        message: 'Offline Failure Drill evidence capture could not be saved.',
        unavailableReason: `File write did not produce a readable capture at ${uri}.`,
      };
    }

    return {
      ok: true,
      action: 'save',
      filename,
      uri,
      message: `Offline Failure Drill evidence capture saved to App Documents / ${EXPORT_DIR}${filename}.`,
    };
  } catch (error) {
    return {
      ok: false,
      action: 'save',
      filename,
      message: 'Offline Failure Drill evidence capture could not be saved.',
      unavailableReason: error instanceof Error ? error.message : 'Unknown file storage error.',
    };
  }
}

export async function shareOfflineFailureDrillEvidenceCaptureBundle(
  bundle: OfflineFailureDrillEvidenceCaptureBundle,
): Promise<OfflineFailureDrillEvidenceExportResult> {
  const saved = await saveOfflineFailureDrillEvidenceCaptureBundle(bundle);
  if (!saved.ok || !saved.uri) return { ...saved, action: 'share' };

  try {
    const Sharing = await import('expo-sharing').catch(() => null);
    const sharing = (Sharing as any)?.default ?? Sharing;
    if (!sharing?.shareAsync) {
      return {
        ...saved,
        ok: false,
        action: 'share',
        message: 'Offline Failure Drill evidence capture saved, but sharing is unavailable on this device.',
        unavailableReason: 'expo-sharing is unavailable.',
      };
    }
    const available = typeof sharing.isAvailableAsync === 'function'
      ? await sharing.isAvailableAsync()
      : true;
    if (!available) {
      return {
        ...saved,
        ok: false,
        action: 'share',
        message: 'Offline Failure Drill evidence capture saved, but the native share sheet is unavailable.',
        unavailableReason: 'Native share sheet unavailable.',
      };
    }
    await sharing.shareAsync(saved.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export Offline Failure Drill Evidence',
      UTI: 'public.json',
    });
    return {
      ...saved,
      ok: true,
      action: 'share',
      message: 'Offline Failure Drill evidence capture ready to save or share.',
    };
  } catch (error) {
    return {
      ...saved,
      ok: false,
      action: 'share',
      message: 'Offline Failure Drill evidence capture saved, but sharing failed.',
      unavailableReason: error instanceof Error ? error.message : 'Unknown sharing error.',
    };
  }
}

export async function exportOfflineFailureDrillEvidenceCaptureBundle(
  bundle: OfflineFailureDrillEvidenceCaptureBundle,
  action: OfflineFailureDrillEvidenceExportAction = 'share',
): Promise<OfflineFailureDrillEvidenceExportResult> {
  if (action === 'copy') {
    const filename = captureFileName(bundle);
    const ok = await copyTextToClipboard(serializeBundle(bundle));
    return {
      ok,
      action,
      filename,
      message: ok
        ? 'Offline Failure Drill evidence capture copied.'
        : 'Offline Failure Drill evidence capture could not be copied.',
      unavailableReason: ok ? undefined : 'Clipboard is unavailable.',
    };
  }
  if (action === 'save') return saveOfflineFailureDrillEvidenceCaptureBundle(bundle);
  return shareOfflineFailureDrillEvidenceCaptureBundle(bundle);
}
