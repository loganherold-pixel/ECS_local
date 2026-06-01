import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

interface Props {
  expeditionId: string;
  routeName: string | null;
  routeNotes: string | null;
  onUpdated: () => void;
}

export default function RouteMetadataCard({
  expeditionId,
  routeName,
  routeNotes,
  onUpdated,
}: Props) {
  const [name, setName] = useState(routeName ?? '');
  const [notes, setNotes] = useState(routeNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<'success' | 'error' | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from props when they change externally
  useEffect(() => { setName(routeName ?? ''); }, [routeName]);
  useEffect(() => { setNotes(routeNotes ?? ''); }, [routeNotes]);

  const save = useCallback(async (field: 'route_name' | 'route_notes', value: string) => {
    setSaving(true);
    setToast(null);
    try {
      const { error } = await supabase
        .from('expeditions')
        .update({ [field]: value || null })
        .eq('id', expeditionId);
      if (error) throw error;
      setToast('success');
      onUpdated();
    } catch {
      setToast('error');
    }
    setSaving(false);
    setTimeout(() => setToast(null), 2500);
  }, [expeditionId, onUpdated]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save('route_name', val), 800);
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save('route_notes', val), 800);
  };

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="trail-sign-outline" size={16} color={TACTICAL.amber} />
          <Text style={s.headerTitle}>ECS ROUTE</Text>
        </View>
        <View style={s.headerRight}>
          {saving && <ActivityIndicator size="small" color={TACTICAL.accent} />}
          {toast === 'success' && (
            <View style={s.toastSuccess}>
              <Ionicons name="checkmark-circle" size={12} color={TACTICAL.successText} />
              <Text style={s.toastSuccessText}>UPDATED</Text>
            </View>
          )}
          {toast === 'error' && (
            <View style={s.toastError}>
              <Ionicons name="alert-circle" size={12} color={TACTICAL.danger} />
              <Text style={s.toastErrorText}>UNABLE TO SAVE</Text>
            </View>
          )}
        </View>
      </View>

      {/* Route Name */}
      <View style={s.fieldGroup}>
        <Text style={s.label}>ROUTE NAME</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={handleNameChange}
          placeholder="Route name"
          placeholderTextColor={TACTICAL.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Route Notes */}
      <View style={s.fieldGroup}>
        <Text style={s.label}>ROUTE NOTES</Text>
        <TextInput
          style={[s.input, s.multiline]}
          value={notes}
          onChangeText={handleNotesChange}
          placeholder="Terrain, access, closures, or route notes"
          placeholderTextColor={TACTICAL.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toastSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(62,107,62,0.15)',
    borderRadius: 6,
  },
  toastSuccessText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.successText,
    letterSpacing: 1,
  },
  toastError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(192,57,43,0.12)',
    borderRadius: 6,
  },
  toastErrorText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 1,
  },
  fieldGroup: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.3)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  multiline: {
    minHeight: 88,
    paddingTop: 10,
  },
});



