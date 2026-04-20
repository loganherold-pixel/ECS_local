/**
 * Expo File System Compatibility Layer — SDK 54+ Safe Wrappers
 * ═══════════════════════════════════════════════════════════════
 *
 * In Expo SDK 54 (expo-file-system ~19.0.0), ALL function-based APIs
 * are deprecated in favour of the new File / Directory class API.
 *
 * This module provides drop-in wrapper functions that use a 3-layer
 * fallback strategy for every operation:
 *
 *   Layer 1 — expo-file-system/legacy  (the official compat shim)
 *   Layer 2 — new File / Directory API (the SDK 54+ replacement)
 *   Layer 3 — classic API with typeof guard (last resort, may warn)
 *
 * Consumers import from here instead of calling expo-file-system
 * directly, ensuring the app works across SDK 53, 54, and future
 * versions without deprecation warnings or runtime crashes.
 *
 * Deprecated APIs wrapped:
 *   getInfoAsync, makeDirectoryAsync, deleteAsync, writeAsStringAsync,
 *   readAsStringAsync, downloadAsync, readDirectoryAsync,
 *   getFreeDiskStorageAsync, getTotalDiskCapacityAsync, documentDirectory,
 *   EncodingType
 */

import { Platform } from 'react-native';

// ── Module-level caches ──────────────────────────────────────

let _legacyFS: any = null;
let _legacyLoaded = false;

let _modernFS: any = null;
let _modernLoaded = false;

let _documentDir: string | null = null;
const SHOULD_DEBUG_DOCUMENT_DIR =
  typeof __DEV__ !== 'undefined' && __DEV__ && Platform.OS === 'android';

// ── Lazy loaders ─────────────────────────────────────────────

async function getLegacy(): Promise<any> {
  if (_legacyLoaded) return _legacyFS;
  _legacyLoaded = true;
  try {
    const mod = await import('expo-file-system/legacy' as any);
    _legacyFS = (mod as any)?.default ?? mod;
  } catch {
    _legacyFS = null;
  }
  return _legacyFS;
}

async function getModern(): Promise<any> {
  if (_modernLoaded) return _modernFS;
  _modernLoaded = true;
  try {
    const mod = await import('expo-file-system');
    _modernFS = (mod as any)?.default ?? mod;
  } catch {
    _modernFS = null;
  }
  return _modernFS;
}

function debugDocumentDir(message: string, metadata?: Record<string, unknown>) {
  if (!SHOULD_DEBUG_DOCUMENT_DIR) return;
  if (metadata) {
    console.log(`[fsCompat] ${message}`, metadata);
    return;
  }
  console.log(`[fsCompat] ${message}`);
}

// ═══════════════════════════════════════════════════════════════
// documentDirectory
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve the app's document directory URI.
 * Caches the result after first resolution.
 */
export async function getDocumentDirectory(): Promise<string> {
  if (_documentDir) return _documentDir;

  // Layer 1: legacy shim
  // ECS already has native persisted state written at this location.
  // Prefer it first so startup/session/setup caches rehydrate from the
  // same durable path across updates and dev-client reloads.
  try {
    const legacy = await getLegacy();
    debugDocumentDir('legacy documentDirectory probe', {
      value: legacy?.documentDirectory ?? null,
    });
    if (legacy?.documentDirectory) {
      _documentDir = legacy.documentDirectory;
      if (_documentDir && !_documentDir.endsWith('/')) _documentDir += '/';
      return _documentDir ?? '';
    }
  } catch {}

  // Layer 2: classic module
  try {
    const mod = await getModern();
    debugDocumentDir('classic documentDirectory probe', {
      value: mod?.documentDirectory ?? null,
    });
    if (mod?.documentDirectory) {
      _documentDir = mod.documentDirectory;
      if (_documentDir && !_documentDir.endsWith('/')) _documentDir += '/';
      return _documentDir ?? '';
    }
  } catch {}

  // Layer 3: new Paths API
  try {
    const mod = await getModern();
    debugDocumentDir('Paths.document probe', {
      value: mod?.Paths?.document?.uri ?? null,
    });
    if (mod?.Paths?.document?.uri) {
      _documentDir = mod.Paths.document.uri;
      if (_documentDir && !_documentDir.endsWith('/')) _documentDir += '/';
      return _documentDir ?? '';
    }
  } catch {}

  debugDocumentDir('documentDirectory unresolved');
  return '';
}

// ═══════════════════════════════════════════════════════════════
// getInfoAsync  →  { exists, isDirectory, size, ... }
// ═══════════════════════════════════════════════════════════════

export interface FsInfo {
  exists: boolean;
  isDirectory: boolean;
  size: number;
  uri: string;
}

/**
 * Get file/directory info (existence, size, type).
 */
export async function fsGetInfo(uri: string): Promise<FsInfo> {
  const notFound: FsInfo = { exists: false, isDirectory: false, size: 0, uri };

  // Layer 1: legacy shim
  try {
    const legacy = await getLegacy();
    if (typeof legacy?.getInfoAsync === 'function') {
      const info = await legacy.getInfoAsync(uri);
      return {
        exists: !!info.exists,
        isDirectory: !!info.isDirectory,
        size: (info as any).size ?? 0,
        uri,
      };
    }
  } catch {}

  // Layer 2: new File / Directory API
  try {
    const mod = await getModern();
    if (mod?.File) {
      // Try as File first
      try {
        const file = new mod.File(uri);
        if (file.exists) {
          return {
            exists: true,
            isDirectory: false,
            size: file.size ?? 0,
            uri,
          };
        }
      } catch {}
      // Try as Directory
      try {
        const dir = new mod.Directory(uri);
        if (dir.exists) {
          return {
            exists: true,
            isDirectory: true,
            size: dir.size ?? 0,
            uri,
          };
        }
      } catch {}
      return notFound;
    }
  } catch {}

  // Layer 3: classic API (may warn on SDK 54+)
  try {
    const mod = await getModern();
    if (typeof (mod as any)?.getInfoAsync === 'function') {
      const info = await (mod as any).getInfoAsync(uri);
      return {
        exists: !!info.exists,
        isDirectory: !!info.isDirectory,
        size: (info as any).size ?? 0,
        uri,
      };
    }
  } catch {}

  return notFound;
}

// ═══════════════════════════════════════════════════════════════
// makeDirectoryAsync
// ═══════════════════════════════════════════════════════════════

/**
 * Create a directory (with intermediates).
 */
export async function fsMakeDir(uri: string): Promise<void> {
  // Layer 1: legacy shim
  try {
    const legacy = await getLegacy();
    if (typeof legacy?.makeDirectoryAsync === 'function') {
      await legacy.makeDirectoryAsync(uri, { intermediates: true });
      return;
    }
  } catch {}

  // Layer 2: new Directory API
  try {
    const mod = await getModern();
    if (mod?.Directory) {
      const dir = new mod.Directory(uri);
      dir.create();
      return;
    }
  } catch {}

  // Layer 3: classic API
  try {
    const mod = await getModern();
    if (typeof (mod as any)?.makeDirectoryAsync === 'function') {
      await (mod as any).makeDirectoryAsync(uri, { intermediates: true });
      return;
    }
  } catch {}

  console.warn('[fsCompat] fsMakeDir: no viable API for', uri);
}

// ═══════════════════════════════════════════════════════════════
// Ensure directory exists (getInfo + makeDir combo)
// ═══════════════════════════════════════════════════════════════

/**
 * Ensure a directory exists, creating it if necessary.
 */
export async function fsEnsureDir(uri: string): Promise<boolean> {
  try {
    const info = await fsGetInfo(uri);
    if (!info.exists) {
      await fsMakeDir(uri);
    }
    return true;
  } catch (e) {
    console.warn('[fsCompat] fsEnsureDir failed:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// deleteAsync
// ═══════════════════════════════════════════════════════════════

/**
 * Delete a file or directory.
 */
export async function fsDelete(uri: string, options?: { idempotent?: boolean }): Promise<void> {
  // Layer 1: legacy shim
  try {
    const legacy = await getLegacy();
    if (typeof legacy?.deleteAsync === 'function') {
      await legacy.deleteAsync(uri, options ?? { idempotent: true });
      return;
    }
  } catch {}

  // Layer 2: new File / Directory API
  try {
    const mod = await getModern();
    if (mod?.File) {
      try {
        const file = new mod.File(uri);
        if (file.exists) { file.delete(); return; }
      } catch {}
      try {
        const dir = new mod.Directory(uri);
        if (dir.exists) { dir.delete(); return; }
      } catch {}
      // If idempotent and nothing exists, that's fine
      if (options?.idempotent) return;
    }
  } catch {}

  // Layer 3: classic API
  try {
    const mod = await getModern();
    if (typeof (mod as any)?.deleteAsync === 'function') {
      await (mod as any).deleteAsync(uri, options ?? { idempotent: true });
      return;
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
// writeAsStringAsync
// ═══════════════════════════════════════════════════════════════

export type FsEncoding = 'utf8' | 'base64';

/**
 * Write a string to a file.
 */
export async function fsWriteString(
  uri: string,
  content: string,
  encoding: FsEncoding = 'utf8',
): Promise<void> {
  // Layer 1: legacy shim
  try {
    const legacy = await getLegacy();
    if (typeof legacy?.writeAsStringAsync === 'function') {
      const enc = encoding === 'base64'
        ? (legacy.EncodingType?.Base64 ?? 'base64')
        : (legacy.EncodingType?.UTF8 ?? 'utf8');
      await legacy.writeAsStringAsync(uri, content, { encoding: enc });
      return;
    }
  } catch {}

  // Layer 2: new File API
  try {
    const mod = await getModern();
    if (mod?.File) {
      const file = new mod.File(uri);
      if (encoding === 'base64') {
        // Convert base64 string to Uint8Array and write bytes
        const binaryStr = typeof atob === 'function'
          ? atob(content)
          : Buffer.from(content, 'base64').toString('binary');
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        file.write(bytes);
      } else {
        file.write(content);
      }
      return;
    }
  } catch {}

  // Layer 3: classic API
  try {
    const mod = await getModern();
    if (typeof (mod as any)?.writeAsStringAsync === 'function') {
      const enc = encoding === 'base64'
        ? ((mod as any).EncodingType?.Base64 ?? 'base64')
        : ((mod as any).EncodingType?.UTF8 ?? 'utf8');
      await (mod as any).writeAsStringAsync(uri, content, { encoding: enc });
      return;
    }
  } catch {}

  console.warn('[fsCompat] fsWriteString: no viable API for', uri);
}

// ═══════════════════════════════════════════════════════════════
// readAsStringAsync
// ═══════════════════════════════════════════════════════════════

/**
 * Read a file as a string.
 */
export async function fsReadString(
  uri: string,
  encoding: FsEncoding = 'utf8',
): Promise<string> {
  // Layer 1: legacy shim
  try {
    const legacy = await getLegacy();
    if (typeof legacy?.readAsStringAsync === 'function') {
      const enc = encoding === 'base64'
        ? (legacy.EncodingType?.Base64 ?? 'base64')
        : (legacy.EncodingType?.UTF8 ?? 'utf8');
      return await legacy.readAsStringAsync(uri, { encoding: enc });
    }
  } catch {}

  // Layer 2: new File API
  try {
    const mod = await getModern();
    if (mod?.File) {
      const file = new mod.File(uri);
      if (encoding === 'base64') {
        if (typeof file.base64 === 'function') {
          return await file.base64();
        }
        // Fallback: read bytes and convert
        const bytes: Uint8Array = await file.bytes();
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return typeof btoa === 'function'
          ? btoa(binary)
          : Buffer.from(bytes).toString('base64');
      } else {
        return await file.text();
      }
    }
  } catch {}

  // Layer 3: classic API
  try {
    const mod = await getModern();
    if (typeof (mod as any)?.readAsStringAsync === 'function') {
      const enc = encoding === 'base64'
        ? ((mod as any).EncodingType?.Base64 ?? 'base64')
        : ((mod as any).EncodingType?.UTF8 ?? 'utf8');
      return await (mod as any).readAsStringAsync(uri, { encoding: enc });
    }
  } catch {}

  throw new Error(`[fsCompat] fsReadString: no viable API for ${uri}`);
}


// ═══════════════════════════════════════════════════════════════
// readFileFromPickerUri — convenience for document-picker imports
// ═══════════════════════════════════════════════════════════════

/**
 * Read a file as UTF-8 text from a document-picker URI.
 *
 * This is the recommended single-call replacement for the inline
 * 3-layer fallback pattern previously duplicated across all import
 * modal components (GpxImportButton, GeoJsonImportModal,
 * GpxImportModal, KmlImportModal).
 *
 * Fallback order:
 *   1. fetch(uri) → response.text()   (works for local file:// URIs
 *      on most platforms and avoids loading expo-file-system entirely)
 *   2. fsReadString(uri, 'utf8')       (the standard 3-layer compat
 *      wrapper: legacy shim → new File API → classic API)
 *
 * Returns the file content as a string, or null if every method
 * fails (caller should show an appropriate error message).
 */
export async function fsReadFileFromPickerUri(uri: string): Promise<string | null> {
  // Layer 1: fetch() — works on all platforms for local file URIs
  try {
    const response = await fetch(uri);
    const text = await response.text();
    if (text && text.length > 0) return text;
  } catch {}

  // Layer 2: fsReadString (legacy → new File API → classic API)
  try {
    const text = await fsReadString(uri, 'utf8');
    if (text && text.length > 0) return text;
  } catch {}

  return null;
}



// ═══════════════════════════════════════════════════════════════
// downloadAsync
// ═══════════════════════════════════════════════════════════════

export interface FsDownloadResult {
  uri: string;
  status: number;
  headers?: Record<string, string>;
}

/**
 * Download a file from a URL to a local path.
 */
export async function fsDownload(
  url: string,
  destUri: string,
): Promise<FsDownloadResult> {
  // Layer 1: legacy shim
  try {
    const legacy = await getLegacy();
    if (typeof legacy?.downloadAsync === 'function') {
      const result = await legacy.downloadAsync(url, destUri);
      return {
        uri: result?.uri ?? destUri,
        status: result?.status ?? 0,
        headers: result?.headers,
      };
    }
  } catch {}

  // Layer 2: new File.downloadFileAsync
  try {
    const mod = await getModern();
    if (mod?.File?.downloadFileAsync) {
      // The new API takes a destination File or Directory
      const destFile = new mod.File(destUri);
      const parentDir = destFile.parentDirectory;
      // downloadFileAsync returns a File
      const downloaded = await mod.File.downloadFileAsync(url, parentDir);
      // Move to exact destination if needed
      if (downloaded.uri !== destUri) {
        try { downloaded.move(destFile); } catch {}
      }
      return {
        uri: destUri,
        status: downloaded.exists ? 200 : 0,
      };
    }
  } catch {}

  // Layer 3: classic API
  try {
    const mod = await getModern();
    if (typeof (mod as any)?.downloadAsync === 'function') {
      const result = await (mod as any).downloadAsync(url, destUri);
      return {
        uri: result?.uri ?? destUri,
        status: result?.status ?? 0,
        headers: result?.headers,
      };
    }
  } catch {}

  // Layer 4: fetch + write fallback
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { uri: destUri, status: response.status };
    }
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    // Convert to base64 and write
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
    await fsWriteString(destUri, base64, 'base64');
    return { uri: destUri, status: 200 };
  } catch {}

  return { uri: destUri, status: 0 };
}

// ═══════════════════════════════════════════════════════════════
// readDirectoryAsync
// ═══════════════════════════════════════════════════════════════

/**
 * List the contents of a directory.
 * Returns an array of file/directory names (not full paths).
 */
export async function fsReadDir(uri: string): Promise<string[]> {
  // Layer 1: legacy shim
  try {
    const legacy = await getLegacy();
    if (typeof legacy?.readDirectoryAsync === 'function') {
      return await legacy.readDirectoryAsync(uri);
    }
  } catch {}

  // Layer 2: new Directory API
  try {
    const mod = await getModern();
    if (mod?.Directory) {
      const dir = new mod.Directory(uri);
      const contents = dir.list();
      return contents.map((item: any) => item.name || '');
    }
  } catch {}

  // Layer 3: classic API
  try {
    const mod = await getModern();
    if (typeof (mod as any)?.readDirectoryAsync === 'function') {
      return await (mod as any).readDirectoryAsync(uri);
    }
  } catch {}

  console.warn('[fsCompat] fsReadDir: no viable API for', uri);
  return [];
}

// ═══════════════════════════════════════════════════════════════
// getFreeDiskStorageAsync / getTotalDiskCapacityAsync
// ═══════════════════════════════════════════════════════════════

/**
 * Get device storage info (free and total disk space in bytes).
 * Returns null if unavailable.
 */
export async function fsGetDiskStorage(): Promise<{
  freeBytes: number;
  totalBytes: number;
} | null> {
  // Layer 1: legacy shim
  try {
    const legacy = await getLegacy();
    if (typeof legacy?.getFreeDiskStorageAsync === 'function') {
      const freeBytes = await legacy.getFreeDiskStorageAsync();
      const totalBytes = typeof legacy.getTotalDiskCapacityAsync === 'function'
        ? await legacy.getTotalDiskCapacityAsync()
        : 0;
      return { freeBytes, totalBytes };
    }
  } catch {}

  // Layer 2: no new API equivalent — skip to Layer 3

  // Layer 3: classic API
  try {
    const mod = await getModern();
    if (typeof (mod as any)?.getFreeDiskStorageAsync === 'function') {
      const freeBytes = await (mod as any).getFreeDiskStorageAsync();
      const totalBytes = typeof (mod as any).getTotalDiskCapacityAsync === 'function'
        ? await (mod as any).getTotalDiskCapacityAsync()
        : 0;
      return { freeBytes, totalBytes };
    }
  } catch {}

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Utility: check if native file system is available
// ═══════════════════════════════════════════════════════════════

/**
 * Returns true if running on a native platform with file system access.
 */
export function isNativeFS(): boolean {
  return Platform.OS !== 'web';
}

