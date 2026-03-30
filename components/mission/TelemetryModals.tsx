// ============================================================
// TELEMETRY MINI MODALS — Fast action bottom-sheet modals
// ============================================================
// A) Log Fuel  B) Log Water  C) Power Setup/Log  D) Buffer Explanation
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Pressable, ScrollView,
} from 'react-native';
import ECSModal from '../ECSModal';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { TelemetryReadout } from '../../lib/missionTypes';


// ── Shared modal wrapper ─────────────────────────────────────
function MiniModal({
  visible,
  onClose,
  title,
  icon,
  iconColor,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: string;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <ECSModal visible={visible} onClose={onClose} tier="global">

      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIconWrap, { backgroundColor: `${iconColor}15` }]}>
              <Ionicons name={icon as any} size={18} color={iconColor} />
            </View>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          {children}
        </Pressable>
      </Pressable>
    </ECSModal>

  );
}

// ============================================================
// A) LOG FUEL MODAL
// ============================================================
interface FuelModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (gallons: number, mode: 'added' | 'used') => void;
  currentMpg: number | null;
  onUpdateMpg?: (mpg: number) => void;
}

export function LogFuelModal({ visible, onClose, onSave, currentMpg, onUpdateMpg }: FuelModalProps) {
  const [gallons, setGallons] = useState('');
  const [mode, setMode] = useState<'added' | 'used'>('used');
  const [mpg, setMpg] = useState(currentMpg?.toString() || '');

  const handleSave = () => {
    const val = parseFloat(gallons);
    if (isNaN(val) || val <= 0) return;
    onSave(val, mode);
    if (onUpdateMpg && mpg && parseFloat(mpg) !== currentMpg) {
      onUpdateMpg(parseFloat(mpg));
    }
    setGallons('');
    onClose();
  };

  return (
    <MiniModal visible={visible} onClose={onClose} title="LOG FUEL" icon="flame-outline" iconColor="#FF9500">
      {/* Mode Toggle */}
      <View style={styles.toggleRow}>
        {(['used', 'added'] as const).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}
            onPress={() => setMode(m)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={m === 'used' ? 'arrow-down-outline' : 'arrow-up-outline'}
              size={14}
              color={mode === m ? '#FF9500' : TACTICAL.textMuted}
            />
            <Text style={[styles.toggleText, mode === m && { color: '#FF9500' }]}>
              {m === 'used' ? 'USED' : 'ADDED'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Gallons Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>GALLONS</Text>
        <TextInput
          style={styles.input}
          value={gallons}
          onChangeText={setGallons}
          placeholder="0.0"
          placeholderTextColor={TACTICAL.textMuted}
          keyboardType="decimal-pad"
          autoFocus
        />
      </View>

      {/* Quick buttons */}
      <View style={styles.quickRow}>
        {['1', '2', '5', '10', '15'].map(val => (
          <TouchableOpacity
            key={val}
            style={[styles.quickChip, gallons === val && styles.quickChipActive]}
            onPress={() => setGallons(val)}
            activeOpacity={0.7}
          >
            <Text style={[styles.quickChipText, gallons === val && { color: '#FF9500' }]}>{val}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* MPG (optional) */}
      {onUpdateMpg && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>MPG (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, { fontSize: 16 }]}
            value={mpg}
            onChangeText={setMpg}
            placeholder={currentMpg?.toString() || '16'}
            placeholderTextColor={TACTICAL.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
      )}

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: '#FF9500' }]}
        onPress={handleSave}
        activeOpacity={0.8}
      >
        <Ionicons name="checkmark" size={18} color="#0B0F12" />
        <Text style={styles.saveBtnText}>SAVE</Text>
      </TouchableOpacity>
    </MiniModal>
  );
}

// ============================================================
// B) LOG WATER MODAL
// ============================================================
interface WaterModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (liters: number) => void;
}

export function LogWaterModal({ visible, onClose, onSave }: WaterModalProps) {
  const [liters, setLiters] = useState('');

  const handleSave = () => {
    const val = parseFloat(liters);
    if (isNaN(val) || val <= 0) return;
    onSave(val);
    setLiters('');
    onClose();
  };

  return (
    <MiniModal visible={visible} onClose={onClose} title="LOG WATER USED" icon="water-outline" iconColor="#4FC3F7">
      {/* Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>LITERS USED</Text>
        <TextInput
          style={styles.input}
          value={liters}
          onChangeText={setLiters}
          placeholder="0.0"
          placeholderTextColor={TACTICAL.textMuted}
          keyboardType="decimal-pad"
          autoFocus
        />
      </View>

      {/* Quick buttons */}
      <View style={styles.quickRow}>
        {['0.25', '0.5', '1', '2', '5'].map(val => (
          <TouchableOpacity
            key={val}
            style={[styles.quickChip, liters === val && styles.quickChipActive]}
            onPress={() => setLiters(val)}
            activeOpacity={0.7}
          >
            <Text style={[styles.quickChipText, liters === val && { color: '#4FC3F7' }]}>{val}L</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: '#4FC3F7' }]}
        onPress={handleSave}
        activeOpacity={0.8}
      >
        <Ionicons name="checkmark" size={18} color="#0B0F12" />
        <Text style={styles.saveBtnText}>SAVE</Text>
      </TouchableOpacity>
    </MiniModal>
  );
}

// ============================================================
// C) POWER MODAL (Setup + Log)
// ============================================================
interface PowerModalProps {
  visible: boolean;
  onClose: () => void;
  isConfigured: boolean;
  onConfigure: (capacityWh: number, avgDrawW: number) => void;
  onLogPower: (whUsed?: number, percentUsed?: number) => void;
}

export function PowerModal({ visible, onClose, isConfigured, onConfigure, onLogPower }: PowerModalProps) {
  const [capacityWh, setCapacityWh] = useState('');
  const [avgDrawW, setAvgDrawW] = useState('');
  const [percentUsed, setPercentUsed] = useState('');

  const handleConfigure = () => {
    const cap = parseFloat(capacityWh);
    const draw = parseFloat(avgDrawW);
    if (isNaN(cap) || cap <= 0) return;
    onConfigure(cap, isNaN(draw) ? 50 : draw);
    setCapacityWh('');
    setAvgDrawW('');
    onClose();
  };

  const handleLogPercent = (pct: number) => {
    onLogPower(undefined, pct);
    onClose();
  };

  const handleLogCustom = () => {
    const pct = parseFloat(percentUsed);
    if (isNaN(pct) || pct <= 0) return;
    onLogPower(undefined, pct);
    setPercentUsed('');
    onClose();
  };

  return (
    <MiniModal visible={visible} onClose={onClose} title={isConfigured ? 'LOG POWER' : 'POWER SETUP'} icon="flash-outline" iconColor="#7C4DFF">
      {!isConfigured ? (
        <>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>BATTERY CAPACITY (Wh)</Text>
            <TextInput
              style={styles.input}
              value={capacityWh}
              onChangeText={setCapacityWh}
              placeholder="e.g. 1260"
              placeholderTextColor={TACTICAL.textMuted}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          {/* Quick presets */}
          <View style={styles.quickRow}>
            {[
              { label: '500Wh', val: '500' },
              { label: '1kWh', val: '1000' },
              { label: '2kWh', val: '2000' },
              { label: '3.6kWh', val: '3600' },
            ].map(p => (
              <TouchableOpacity
                key={p.val}
                style={[styles.quickChip, capacityWh === p.val && styles.quickChipActive]}
                onPress={() => setCapacityWh(p.val)}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickChipText, capacityWh === p.val && { color: '#7C4DFF' }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>AVG DRAW (W)</Text>
            <TextInput
              style={[styles.input, { fontSize: 16 }]}
              value={avgDrawW}
              onChangeText={setAvgDrawW}
              placeholder="e.g. 50"
              placeholderTextColor={TACTICAL.textMuted}
              keyboardType="decimal-pad"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: '#7C4DFF' }]}
            onPress={handleConfigure}
            activeOpacity={0.8}
          >
            <Ionicons name="flash" size={18} color="#0B0F12" />
            <Text style={styles.saveBtnText}>CONFIGURE</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.sectionLabel}>QUICK LOG</Text>
          <View style={styles.quickRow}>
            {[5, 10, 20, 25, 50].map(pct => (
              <TouchableOpacity
                key={pct}
                style={styles.quickChip}
                onPress={() => handleLogPercent(pct)}
                activeOpacity={0.7}
              >
                <Text style={styles.quickChipText}>{pct}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>CUSTOM % USED</Text>
            <TextInput
              style={styles.input}
              value={percentUsed}
              onChangeText={setPercentUsed}
              placeholder="0"
              placeholderTextColor={TACTICAL.textMuted}
              keyboardType="decimal-pad"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: '#7C4DFF' }]}
            onPress={handleLogCustom}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark" size={18} color="#0B0F12" />
            <Text style={styles.saveBtnText}>SAVE</Text>
          </TouchableOpacity>
        </>
      )}
    </MiniModal>
  );
}

// ============================================================
// D) BUFFER EXPLANATION MODAL
// ============================================================
interface BufferModalProps {
  visible: boolean;
  onClose: () => void;
  readout: TelemetryReadout;
  onOpenFuel: () => void;
  onOpenWater: () => void;
  onOpenPower: () => void;
}

export function BufferExplanationModal({ visible, onClose, readout, onOpenFuel, onOpenWater, onOpenPower }: BufferModalProps) {
  const limiterLabel = readout.bufferLimiter === 'none' ? 'None' :
    readout.bufferLimiter.charAt(0).toUpperCase() + readout.bufferLimiter.slice(1);

  const bufferColor = readout.bufferLevel === 'HIGH' ? '#4CAF50' :
    readout.bufferLevel === 'MED' ? TACTICAL.amber : '#E53935';

  const systems = [
    {
      key: 'fuel',
      label: 'FUEL',
      icon: 'flame-outline',
      color: '#FF9500',
      percent: readout.fuelPercent,
      configured: readout.fuelConfigured,
      onAction: onOpenFuel,
      actionLabel: 'Log Fuel',
    },
    {
      key: 'water',
      label: 'WATER',
      icon: 'water-outline',
      color: '#4FC3F7',
      percent: readout.waterConfigured && readout.waterRemainingL !== null
        ? Math.round((readout.waterRemainingL / ((readout.waterDailyBurnL || 1) * 10)) * 100)
        : null,
      configured: readout.waterConfigured,
      onAction: onOpenWater,
      actionLabel: 'Log Water',
    },
    {
      key: 'power',
      label: 'POWER',
      icon: 'flash-outline',
      color: '#7C4DFF',
      percent: readout.powerPercent,
      configured: readout.powerConfigured,
      onAction: onOpenPower,
      actionLabel: readout.powerConfigured ? 'Log Power' : 'Set Power',
    },
  ];

  return (
    <MiniModal visible={visible} onClose={onClose} title="BUFFER ANALYSIS" icon="shield-outline" iconColor={bufferColor}>
      {/* Overall buffer */}
      <View style={[styles.bufferOverview, { borderColor: `${bufferColor}40` }]}>
        <Text style={[styles.bufferOverviewLevel, { color: bufferColor }]}>{readout.bufferLevel}</Text>
        <Text style={styles.bufferOverviewPct}>{readout.bufferPercent}% margin</Text>
        <Text style={styles.bufferOverviewLimiter}>
          {readout.bufferLimiter !== 'none'
            ? `Limiting factor: ${limiterLabel}`
            : 'No limiting factor detected'}
        </Text>
      </View>

      {/* System breakdown */}
      <Text style={styles.sectionLabel}>SYSTEM STATUS</Text>
      {systems.map(sys => {
        const isLimiter = readout.bufferLimiter === sys.key;
        return (
          <View key={sys.key} style={[styles.systemRow, isLimiter && { borderColor: `${sys.color}50`, backgroundColor: `${sys.color}08` }]}>
            <View style={styles.systemRowLeft}>
              <Ionicons name={sys.icon as any} size={16} color={sys.color} />
              <View>
                <Text style={styles.systemLabel}>{sys.label}</Text>
                <Text style={styles.systemStatus}>
                  {sys.configured
                    ? `${sys.percent ?? '--'}%`
                    : 'Not configured'}
                </Text>
              </View>
              {isLimiter && (
                <View style={[styles.limiterBadge, { backgroundColor: `${sys.color}20` }]}>
                  <Text style={[styles.limiterBadgeText, { color: sys.color }]}>LIMITER</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[styles.systemActionBtn, { borderColor: `${sys.color}40` }]}
              onPress={() => { onClose(); setTimeout(sys.onAction, 300); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.systemActionText, { color: sys.color }]}>{sys.actionLabel}</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      {/* How it works */}
      <View style={styles.howItWorks}>
        <Ionicons name="information-circle-outline" size={14} color={TACTICAL.textMuted} />
        <Text style={styles.howItWorksText}>
          Buffer is calculated from the lowest system reserve. Keep all systems above 25% for HIGH buffer status.
        </Text>
      </View>
    </MiniModal>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#151A1F',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderColor: TACTICAL.border,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: TACTICAL.textMuted,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
    opacity: 0.4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  sheetIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  toggleBtnActive: {
    borderColor: 'rgba(255,149,0,0.4)',
    backgroundColor: 'rgba(255,149,0,0.08)',
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: TACTICAL.text,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Courier',
    textAlign: 'center',
  },

  quickRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  quickChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  quickChipActive: {
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
  },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 2,
  },

  sectionLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 10,
  },

  // Buffer modal
  bufferOverview: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginBottom: 16,
    gap: 4,
  },
  bufferOverviewLevel: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
  },
  bufferOverviewPct: {
    fontSize: 14,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  bufferOverviewLimiter: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },

  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginBottom: 8,
  },
  systemRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  systemLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
  systemStatus: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  limiterBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  limiterBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  systemActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  systemActionText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  howItWorks: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  howItWorksText: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
});



