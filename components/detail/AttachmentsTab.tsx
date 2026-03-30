import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import type { Attachment, AttachmentCategory } from '../../lib/types';

const BUCKET = 'ecs';

const CATEGORIES: { value: AttachmentCategory; label: string; icon: string }[] = [
  { value: 'general', label: 'GENERAL', icon: 'document-outline' },
  { value: 'map', label: 'MAP', icon: 'map-outline' },
  { value: 'photo', label: 'PHOTO', icon: 'camera-outline' },
  { value: 'document', label: 'DOCUMENT', icon: 'reader-outline' },
  { value: 'permit', label: 'PERMIT', icon: 'shield-checkmark-outline' },
  { value: 'receipt', label: 'RECEIPT', icon: 'receipt-outline' },
];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(ts: string): string {
  try {
    const d = new Date(ts);
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch { return ts; }
}

function getFileIcon(fileType: string | null): string {
  if (!fileType) return 'document-outline';
  if (fileType.startsWith('image/')) return 'image-outline';
  if (fileType.includes('pdf')) return 'document-text-outline';
  if (fileType.includes('zip') || fileType.includes('tar')) return 'file-tray-outline';

  if (fileType.includes('video')) return 'videocam-outline';
  return 'document-outline';
}

interface Props {
  expeditionId: string;
  userId: string;
}

export default function AttachmentsTab({ expeditionId, userId }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Mounted ref to prevent setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAttachments = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const { data, error: err } = await supabase
        .from('attachments')
        .select('*')
        .eq('expedition_id', expeditionId)
        .order('created_at', { ascending: false });
      if (!mountedRef.current) return;
      if (err) {
        console.warn('[AttachmentsTab] fetchAttachments error:', err.message);
        setError('FAILED TO LOAD ATTACHMENTS');
      } else {
        setAttachments(data || []);
      }
    } catch (ex: any) {
      console.warn('[AttachmentsTab] fetchAttachments exception:', ex?.message || ex);
      if (mountedRef.current) setError('FAILED TO LOAD ATTACHMENTS');
    }
    if (mountedRef.current) setLoading(false);
  }, [expeditionId]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  const handleUpload = async () => {
    if (Platform.OS !== 'web') {
      setError('FILE UPLOAD AVAILABLE ON WEB ONLY');
      return;
    }

    try {
      // Create file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '*/*';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (mountedRef.current) {
          setUploading(true);
          setError(null);
          setSuccess(null);
        }

        try {
          const storagePath = `${userId}/${expeditionId}/${Date.now()}_${file.name}`;

          // Upload to storage
          const { error: uploadErr } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (!mountedRef.current) return;
          if (uploadErr) throw uploadErr;

          // Save metadata
          const { error: metaErr } = await supabase.from('attachments').insert({
            expedition_id: expeditionId,
            owner_user_id: userId,
            file_name: file.name,
            file_type: file.type || null,
            file_size: file.size || null,
            storage_path: storagePath,
            category: 'general',
          });

          if (!mountedRef.current) return;
          if (metaErr) throw metaErr;

          setSuccess('FILE UPLOADED SUCCESSFULLY');
          setTimeout(() => {
            if (mountedRef.current) setSuccess(null);
          }, 3000);
          await fetchAttachments();
        } catch (err: any) {
          console.warn('[AttachmentsTab] handleUpload inner exception:', err?.message || err);
          if (mountedRef.current) setError('UPLOAD FAILED: ' + (err?.message || 'Unknown error'));
        }
        if (mountedRef.current) setUploading(false);
      };
      input.click();
    } catch (ex: any) {
      console.warn('[AttachmentsTab] handleUpload outer exception:', ex?.message || ex);
      if (mountedRef.current) setError('UPLOAD FAILED');
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      const { data, error: err } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(attachment.storage_path, 300);

      if (!mountedRef.current) return;

      if (err || !data?.signedUrl) {
        console.warn('[AttachmentsTab] handleDownload error:', err?.message || 'no signed URL');
        setError('FAILED TO GENERATE DOWNLOAD LINK');
        return;
      }

      if (Platform.OS === 'web') {
        window.open(data.signedUrl, '_blank');
      }
    } catch (ex: any) {
      console.warn('[AttachmentsTab] handleDownload exception:', ex?.message || ex);
      if (mountedRef.current) setError('DOWNLOAD FAILED');
    }
  };

  const handleDelete = async (attachment: Attachment) => {
    const doDelete = async () => {
      try {
        // Delete from storage
        await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
        if (!mountedRef.current) return;
        // Delete metadata
        const { error: err } = await supabase.from('attachments').delete().eq('id', attachment.id);
        if (!mountedRef.current) return;
        if (err) {
          console.warn('[AttachmentsTab] handleDelete metadata error:', err.message);
          setError('DELETE FAILED');
        } else {
          fetchAttachments();
        }
      } catch (ex: any) {
        console.warn('[AttachmentsTab] handleDelete exception:', ex?.message || ex);
        if (mountedRef.current) setError('DELETE FAILED');
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`Delete ${attachment.file_name}?`)) doDelete();
    } else {
      Alert.alert('Delete File', `Remove ${attachment.file_name}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleUpdateCategory = async (id: string, cat: AttachmentCategory) => {
    try {
      const { error: err } = await supabase.from('attachments').update({ category: cat }).eq('id', id);
      if (!mountedRef.current) return;
      if (err) {
        console.warn('[AttachmentsTab] handleUpdateCategory error:', err.message);
        setError('FAILED TO UPDATE CATEGORY');
      } else {
        setAttachments(prev => prev.map(a => a.id === id ? { ...a, category: cat } : a));
      }
    } catch (ex: any) {
      console.warn('[AttachmentsTab] handleUpdateCategory exception:', ex?.message || ex);
      if (mountedRef.current) setError('FAILED TO UPDATE CATEGORY');
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={TACTICAL.accent} />
        <Text style={s.loadingText}>LOADING ATTACHMENTS...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {success && (
        <View style={s.successBanner}>
          <Ionicons name="checkmark-circle" size={16} color={TACTICAL.successText} />
          <Text style={s.successText}>{success}</Text>
        </View>
      )}
      {error && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={TACTICAL.danger} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}><Ionicons name="close" size={16} color={TACTICAL.danger} /></TouchableOpacity>
        </View>
      )}

      {/* Upload button */}
      <TouchableOpacity style={s.uploadBtn} onPress={handleUpload} disabled={uploading}>
        {uploading ? (
          <><ActivityIndicator size="small" color={TACTICAL.text} /><Text style={s.uploadBtnText}>UPLOADING...</Text></>
        ) : (
          <><Ionicons name="cloud-upload-outline" size={18} color={TACTICAL.text} /><Text style={s.uploadBtnText}>UPLOAD FILE</Text></>
        )}
      </TouchableOpacity>

      {/* Stats */}
      {attachments.length > 0 && (
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{attachments.length}</Text>
            <Text style={s.statLabel}>FILES</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{formatFileSize(attachments.reduce((sum, a) => sum + (a.file_size || 0), 0))}</Text>
            <Text style={s.statLabel}>TOTAL SIZE</Text>
          </View>
        </View>
      )}

      {/* Attachment list */}
      {attachments.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="folder-open-outline" size={40} color={TACTICAL.textMuted} />
          <Text style={s.emptyTitle}>NO ATTACHMENTS</Text>
          <Text style={s.emptySubtitle}>Upload maps, photos, permits, and documents</Text>
        </View>
      ) : (
        attachments.map(att => {
          const catCfg = CATEGORIES.find(c => c.value === att.category) || CATEGORIES[0];
          return (
            <View key={att.id} style={s.fileCard}>
              <View style={s.fileHeader}>
                <View style={s.fileIconWrap}>
                  <Ionicons name={getFileIcon(att.file_type) as any} size={22} color={TACTICAL.amber} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fileName} numberOfLines={1}>{att.file_name}</Text>
                  <View style={s.fileMeta}>
                    <Text style={s.fileMetaText}>{formatFileSize(att.file_size)}</Text>
                    <Text style={s.fileMetaDot}>|</Text>
                    <Text style={s.fileMetaText}>{formatDate(att.created_at)}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleDownload(att)} style={s.fileActionBtn}>
                  <Ionicons name="download-outline" size={18} color={TACTICAL.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(att)} style={s.fileActionBtn}>
                  <Ionicons name="trash-outline" size={18} color={TACTICAL.danger} />
                </TouchableOpacity>
              </View>

              {/* Category chips */}
              <View style={s.catRow}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity
                    key={c.value}
                    style={[s.catChip, att.category === c.value && s.catChipActive]}
                    onPress={() => handleUpdateCategory(att.id, c.value)}
                  >
                    <Ionicons name={c.icon as any} size={10} color={att.category === c.value ? TACTICAL.amber : TACTICAL.textMuted} />
                    <Text style={[s.catChipText, att.category === c.value && s.catChipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 0 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 12, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(62,107,62,0.15)', borderWidth: 1, borderColor: 'rgba(62,107,62,0.3)', borderRadius: 10, padding: 12, marginBottom: 14 },
  successText: { fontSize: 12, fontWeight: '700', color: TACTICAL.successText },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(192,57,43,0.15)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.3)', borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText: { fontSize: 12, fontWeight: '700', color: TACTICAL.danger, flex: 1 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: TACTICAL.accent, borderRadius: TACTICAL.radius, padding: 14, marginBottom: 16 },
  uploadBtnText: { fontSize: 13, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1.5 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: TACTICAL.panel, borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  statLabel: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  emptySubtitle: { fontSize: 12, color: TACTICAL.textMuted },
  fileCard: { backgroundColor: TACTICAL.panel, borderRadius: TACTICAL.radius, borderWidth: 1, borderColor: TACTICAL.border, padding: 14, marginBottom: 10 },
  fileHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  fileIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(196,138,44,0.1)', alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 14, fontWeight: '700', color: TACTICAL.text },
  fileMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  fileMetaText: { fontSize: 10, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  fileMetaDot: { fontSize: 10, color: TACTICAL.textMuted },
  fileActionBtn: { padding: 8 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.bg },
  catChipActive: { borderColor: 'rgba(196,138,44,0.4)', backgroundColor: 'rgba(196,138,44,0.1)' },
  catChipText: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  catChipTextActive: { color: TACTICAL.amber },
});



