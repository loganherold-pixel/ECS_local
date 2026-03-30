/**
 * VehicleDropdown — Primary Vehicle Selector
 *
 * UI Consistency Pass:
 *   • Label uses TYPO.T4 sizing (uppercase, tracking)
 *   • Dropdown button uses standardized padding (DENSITY.cardPad)
 *   • Vehicle list uses DENSITY.listRowHeight for row height
 *   • Icon containers use ICON_BOX.sm sizing (32px)
 *   • Close button uses standardized CLOSE_BTN sizing
 *   • Container border radius uses ECS.radius (14)
 *   • Dynamic maxHeight via useDynamicMaxHeight
 *   • All touch targets meet 44px minimum
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import ECSModal from './ECSModal';

import { SafeIcon as Ionicons } from './SafeIcon';

import { COLORS, SPACING, RADIUS, DENSITY, TYPO, ECS } from '../lib/theme';
import { CLOSE_BTN, ICON_BOX, SECTION } from '../lib/uiConstants';
import { useDynamicMaxHeight } from '../lib/useSheetLayout';
import { vehicleStore } from '../lib/vehicleStore';
import { useApp } from '../context/AppContext';

import type { Vehicle } from '../lib/types';

interface VehicleDropdownProps {
  value: string | null;
  onChange: (vehicleName: string | null) => void;
  onNavigateToConfig: () => void;
}

export default function VehicleDropdown({ value, onChange, onNavigateToConfig }: VehicleDropdownProps) {
  const { user } = useApp();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownMaxH = useDynamicMaxHeight(0.55);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await vehicleStore.getAll(user?.id || null);
      setVehicles(result.vehicles);
    } catch (err) {
      console.warn('[VehicleDropdown] fetch error:', err);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  // Re-fetch when dropdown opens (in case vehicles were added)
  const handleOpen = () => {
    fetchVehicles();
    setShowDropdown(true);
  };

  const selectVehicle = (v: Vehicle) => {
    onChange(v.name);
    setShowDropdown(false);
  };

  const clearSelection = () => {
    onChange(null);
    setShowDropdown(false);
  };

  // If loading, show spinner
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Primary Vehicle</Text>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={COLORS.gold} />
          <Text style={styles.loadingText}>Loading vehicles...</Text>
        </View>
      </View>
    );
  }

  // If no vehicles exist, show "Go to Vehicle Config" button
  if (vehicles.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Primary Vehicle</Text>
        <TouchableOpacity
          style={styles.configBtn}
          onPress={onNavigateToConfig}
          activeOpacity={0.7}
        >
          <Ionicons name="car-sport-outline" size={16} color={COLORS.gold} />
          <View style={styles.configBtnTextWrap}>
            <Text style={styles.configBtnTitle}>No Vehicles Configured</Text>
            <Text style={styles.configBtnSubtext}>Tap to set up a vehicle</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  // Normal dropdown
  const selectedVehicle = vehicles.find(v => v.name === value);
  const displayText = selectedVehicle
    ? selectedVehicle.name
    : value || 'Select Vehicle';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Primary Vehicle</Text>
      <TouchableOpacity
        style={styles.dropdownBtn}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        <Ionicons
          name={selectedVehicle ? 'car-sport' : 'car-sport-outline'}
          size={16}
          color={selectedVehicle ? COLORS.gold : COLORS.textMuted}
        />
        <Text style={[
          styles.dropdownText,
          !selectedVehicle && !value && styles.dropdownPlaceholder,
        ]}>
          {displayText}
        </Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      {/* Dropdown Modal */}
      <ECSModal visible={showDropdown} onClose={() => setShowDropdown(false)} tier="global">

        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDropdown(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.dropdownContainer, { maxHeight: dropdownMaxH }]}>
            {/* Header */}
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>SELECT VEHICLE</Text>
              <TouchableOpacity
                onPress={() => setShowDropdown(false)}
                hitSlop={CLOSE_BTN.hitSlop}
                style={styles.headerCloseBtn}
              >
                <Ionicons name="close" size={CLOSE_BTN.iconSize} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Vehicle List */}
            <ScrollView
              style={styles.vehicleList}
              showsVerticalScrollIndicator={false}
            >
              {/* None option */}
              <TouchableOpacity
                style={[
                  styles.vehicleOption,
                  !value && styles.vehicleOptionSelected,
                ]}
                onPress={clearSelection}
                activeOpacity={0.7}
              >
                <View style={styles.vehicleOptionIcon}>
                  <Ionicons name="remove-circle-outline" size={18} color={COLORS.textMuted} />
                </View>
                <View style={styles.vehicleOptionInfo}>
                  <Text style={[
                    styles.vehicleOptionName,
                    !value && styles.vehicleOptionNameSelected,
                  ]}>
                    None
                  </Text>
                </View>
                {!value && (
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.gold} />
                )}
              </TouchableOpacity>

              {vehicles.map(v => {
                const isSelected = v.name === value;
                const details = [v.year, v.make, v.model].filter(Boolean).join(' ');
                const hasConfig = !!(v as any).wizard_config;

                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.vehicleOption,
                      isSelected && styles.vehicleOptionSelected,
                    ]}
                    onPress={() => selectVehicle(v)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.vehicleOptionIcon,
                      isSelected && styles.vehicleOptionIconSelected,
                    ]}>
                      <Ionicons
                        name="car-sport"
                        size={18}
                        color={isSelected ? COLORS.gold : COLORS.textSecondary}
                      />
                    </View>
                    <View style={styles.vehicleOptionInfo}>
                      <Text style={[
                        styles.vehicleOptionName,
                        isSelected && styles.vehicleOptionNameSelected,
                      ]}>
                        {v.name}
                      </Text>
                      {details ? (
                        <Text style={styles.vehicleOptionDetails}>{details}</Text>
                      ) : null}
                      {hasConfig && (
                        <View style={styles.configuredTag}>
                          <Ionicons name="checkmark-circle" size={10} color="#66BB6A" />
                          <Text style={styles.configuredTagText}>CONFIGURED</Text>
                        </View>
                      )}
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.gold} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Footer: Go to Vehicle Config */}
            <View style={styles.dropdownFooter}>
              <TouchableOpacity
                style={styles.addVehicleBtn}
                onPress={() => {
                  setShowDropdown(false);
                  onNavigateToConfig();
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={16} color={COLORS.gold} />
                <Text style={styles.addVehicleBtnText}>Add New Vehicle</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </ECSModal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginBottom: SPACING.md,
  },
  // T4 Label — standardized
  label: {
    ...TYPO.T4,
    fontSize: 11,
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },

  // Loading
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DENSITY.iconTextGap,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: DENSITY.cardPad,
    minHeight: 44,
  },
  loadingText: {
    ...TYPO.B2,
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Config button (no vehicles)
  configBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DENSITY.iconTextGap,
    backgroundColor: COLORS.goldMuted,
    borderWidth: 1,
    borderColor: COLORS.goldBorder,
    borderRadius: RADIUS.sm,
    padding: DENSITY.cardPad,
    minHeight: 48,
  },
  configBtnTextWrap: {
    flex: 1,
  },
  configBtnTitle: {
    ...TYPO.T3,
    fontSize: 13,
    color: COLORS.gold,
  },
  configBtnSubtext: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // Dropdown button
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DENSITY.iconTextGap,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: DENSITY.cardPad,
    paddingVertical: SPACING.sm,
    minHeight: 48,
  },
  dropdownText: {
    flex: 1,
    ...TYPO.B1,
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  dropdownPlaceholder: {
    color: COLORS.textMuted,
    fontWeight: '400',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownContainer: {
    backgroundColor: COLORS.bgCard,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: COLORS.goldBorder,
    width: 320,
    maxWidth: '90%',
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SECTION.modalPad,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dropdownTitle: {
    ...TYPO.T4,
    fontSize: 12,
    letterSpacing: 1.5,
    color: COLORS.gold,
  },
  headerCloseBtn: {
    width: CLOSE_BTN.size,
    height: CLOSE_BTN.size,
    borderRadius: CLOSE_BTN.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Vehicle List
  vehicleList: {
    flex: 1,
  },
  vehicleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DENSITY.iconTextGap,
    paddingHorizontal: SECTION.modalPad,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,42,42,0.5)',
    minHeight: 56,
  },
  vehicleOptionSelected: {
    backgroundColor: COLORS.goldMuted,
  },
  vehicleOptionIcon: {
    width: ICON_BOX.sm.size,
    height: ICON_BOX.sm.size,
    borderRadius: ICON_BOX.sm.radius,
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleOptionIconSelected: {
    backgroundColor: 'rgba(212,175,55,0.2)',
  },
  vehicleOptionInfo: {
    flex: 1,
  },
  vehicleOptionName: {
    ...TYPO.B1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  vehicleOptionNameSelected: {
    color: COLORS.gold,
  },
  vehicleOptionDetails: {
    ...TYPO.B2,
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  configuredTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  configuredTagText: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 0.8,
    color: '#66BB6A',
  },

  // Footer
  dropdownFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: SPACING.md,
  },
  addVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: DENSITY.iconTextGap,
    paddingVertical: DENSITY.internalRowGap,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.goldBorder,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(212,175,55,0.04)',
    minHeight: 44,
  },
  addVehicleBtnText: {
    ...TYPO.U2,
    fontSize: 12,
    letterSpacing: 0.5,
    color: COLORS.gold,
    textTransform: 'none',
    fontWeight: '700',
  },
});





