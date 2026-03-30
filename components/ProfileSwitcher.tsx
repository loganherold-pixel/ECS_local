/**
 * ProfileSwitcher — Dashboard Profile Selector + Navigation
 *
 * Long press shield → opens this panel.
 * Top section: 3 dashboard profiles (Expedition / Vehicle / Emergency)
 * Bottom section: Navigation grid for all app sections
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from './SafeIcon';

import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';
import {
  dashboardStore,
  type DashboardProfile,
} from '../lib/dashboardStore';

interface ProfileSwitcherProps {
  visible: boolean;
  onClose: () => void;
}

const PROFILES: { key: DashboardProfile; label: string; icon: string; color: string; desc: string }[] = [
  { key: 'expedition', label: 'EXPEDITION', icon: 'compass-outline', color: '#C48A2C', desc: 'Mission planning & readiness' },
  { key: 'vehicle', label: 'VEHICLE', icon: 'car-outline', color: '#4FC3F7', desc: 'Vehicle systems & health' },
  { key: 'emergency', label: 'EMERGENCY', icon: 'shield-outline', color: '#C0392B', desc: 'Emergency protocols & SOS' },
];

const NAV_ITEMS: {
  key: string;
  label: string;
  icon: string;
  route: string;
  description: string;
}[] = [
  { key: 'fleet', label: 'FLEET', icon: 'car-outline', route: '/(tabs)/fleet', description: 'Vehicle & loadout management' },
  { key: 'trips', label: 'TRIPS', icon: 'map-outline', route: '/(tabs)/trips', description: 'Trip planning' },

  { key: 'loadmap', label: 'LOAD MAP', icon: 'grid-outline', route: '/(tabs)/loadmap', description: 'Slot mapping' },
  { key: 'route', label: 'ROUTE', icon: 'navigate-outline', route: '/(tabs)/route', description: 'Route tracking' },
  { key: 'more', label: 'COMMAND OPS', icon: 'settings-outline', route: '/(tabs)/more', description: 'Risk, logs, settings' },
];


export default function ProfileSwitcher({ visible, onClose }: ProfileSwitcherProps) {
  const router = useRouter();
  const { user, operatorInfo, signOut, showToast, activeTrip } = useApp();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;

  const activeProfile = dashboardStore.getActiveProfile();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 60, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const handleProfileSelect = (profile: DashboardProfile) => {
    dashboardStore.setActiveProfile(profile);
    onClose();
    setTimeout(() => {
      router.push('/(tabs)/dashboard');
    }, 80);
  };

  const handleNav = (route: string) => {
    onClose();
    setTimeout(() => {
      router.push(route as any);
    }, 80);
  };

  const handleSignOut = async () => {
    onClose();
    await signOut();
    showToast('Session terminated');
    router.replace('/login');
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Panel */}
      <Animated.View style={[styles.panel, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Operator Info */}
          {user && (
            <View style={styles.operatorSection}>
              <View style={styles.operatorIcon}>
                <Ionicons name="person" size={16} color={TACTICAL.amber} />
              </View>
              <View style={styles.operatorInfo}>
                <Text style={styles.operatorEmail} numberOfLines={2}>

                  {user.email || 'OPERATOR'}
                </Text>
                <View style={styles.operatorBadges}>
                  {operatorInfo?.role && (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{operatorInfo.role.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>{operatorInfo?.status?.toUpperCase() || 'ACTIVE'}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Active Trip */}
          {activeTrip && (
            <View style={styles.activeTripBar}>
              <Ionicons name="radio" size={12} color="#4CAF50" />
              <Text style={styles.activeTripText} numberOfLines={2}>{activeTrip.name}</Text>

              <Text style={styles.activeTripLabel}>ACTIVE</Text>
            </View>
          )}

          <View style={styles.divider} />

          {/* Dashboard Profiles */}
          <Text style={styles.sectionLabel}>DASHBOARD PROFILES</Text>
          <View style={styles.profileGrid}>
            {PROFILES.map(p => {
              const isActive = p.key === activeProfile;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.profileCard, isActive && { borderColor: p.color, backgroundColor: `${p.color}08` }]}
                  onPress={() => handleProfileSelect(p.key)}
                  activeOpacity={0.6}
                >
                  <View style={[styles.profileIconWrap, { backgroundColor: `${p.color}15` }]}>
                    <Ionicons name={p.icon as any} size={22} color={p.color} />
                  </View>
                  <Text style={[styles.profileName, isActive && { color: p.color }]}>{p.label}</Text>
                  <Text style={styles.profileDesc}>{p.desc}</Text>
                  {isActive && (
                    <View style={[styles.activeIndicator, { backgroundColor: p.color }]}>
                      <Text style={styles.activeIndicatorText}>ACTIVE</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.divider} />

          {/* Navigation Grid */}
          <Text style={styles.sectionLabel}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            {NAV_ITEMS.map(item => (
              <TouchableOpacity
                key={item.key}
                style={styles.navItem}
                onPress={() => handleNav(item.route)}
                activeOpacity={0.6}
              >
                <View style={styles.navIconWrap}>
                  <Ionicons name={item.icon as any} size={20} color={TACTICAL.text} />
                </View>
                <Text style={styles.navLabel}>{item.label}</Text>
                <Text style={styles.navDesc}>{item.description}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.divider} />

          {/* Sign Out */}
          {user && (
            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={16} color={TACTICAL.danger} />
              <Text style={styles.signOutText}>TERMINATE SESSION</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: TACTICAL.border,
    paddingTop: 20,
    paddingHorizontal: 16,
    maxHeight: Dimensions.get('window').height * 0.8,
  },
  operatorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  operatorIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(196,138,44,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.25)',
  },
  operatorInfo: { flex: 1 },
  operatorEmail: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  operatorBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.25)',
  },
  roleBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  activeTripBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.2)',
    marginBottom: 4,
  },
  activeTripText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  activeTripLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1.5,
  },
  divider: {
    height: 1,
    backgroundColor: TACTICAL.border,
    marginVertical: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
    marginBottom: 10,
  },

  // ── Profile Cards ──────────────────────────────────
  profileGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  profileCard: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  profileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  profileName: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1,
    textAlign: 'center',
  },
  profileDesc: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    alignItems: 'center',
  },
  activeIndicatorText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },

  // ── Navigation Grid ────────────────────────────────
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  navItem: {
    width: '30%',
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: TACTICAL.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
    alignItems: 'center',
    minWidth: 95,
  },
  navIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(62,79,60,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  navLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1,
    textAlign: 'center',
  },
  navDesc: {
    fontSize: 8,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.25)',
    backgroundColor: 'rgba(192,57,43,0.06)',
  },
  signOutText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 1.5,
  },
});





