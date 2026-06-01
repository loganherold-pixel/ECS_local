/**
 * Auth Modal — Account panel accessible from header
 *
 * Uses ECS Overlay Motion System (Tier A — Global)
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from './SafeIcon';

import { AUTH_COPY } from '../lib/auth/authCopy';
import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';
import TacticalPopupShell from './TacticalPopupShell';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AuthModal({ visible, onClose }: AuthModalProps) {
  const router = useRouter();
  const {
    user,
    operatorInfo,
    signOut,
    isOnline,
    connectivityStatus,
    offlineMode,
    syncStatus,
    dirtyCount,
    queueSize,
    exitOfflineMode,
  } = useApp();

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  const handleSignIn = () => {
    onClose();
    if (offlineMode) {
      exitOfflineMode();
    }
    router.push('/login');
  };

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      tier="global"
      title={AUTH_COPY.account.header}
      subtitle="Connection state, account profile, and sync readiness."
      eyebrow="ACCOUNT"
      icon="person-circle-outline"
      overlayClass="dialog"
      scrollable
    >
      <View style={styles.panel}>
        <View style={styles.connectivitySection}>
          <View style={styles.connectRow}>
            <Ionicons
              name={isOnline ? 'wifi' : connectivityStatus === 'reconnecting' ? 'wifi-outline' : 'cloud-offline-outline'}
              size={16}
              color={isOnline ? '#4CAF50' : connectivityStatus === 'reconnecting' ? TACTICAL.amber : TACTICAL.textMuted}
            />
            <Text style={[
              styles.connectText,
              { color: isOnline ? '#4CAF50' : connectivityStatus === 'reconnecting' ? TACTICAL.amber : TACTICAL.textMuted },
            ]}>
              {isOnline ? 'ONLINE' : connectivityStatus === 'reconnecting' ? 'SYNCING' : 'OFFLINE'}
            </Text>
          </View>
          {!isOnline ? (
            <Text style={styles.connectNote}>
              Core features stay available with saved data. Sync resumes automatically when signal returns.
            </Text>
          ) : null}
        </View>

        <View style={styles.divider} />

        {user ? (
          <>
            <View style={styles.userSection}>
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={20} color={TACTICAL.amber} />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userEmail} numberOfLines={2}>
                  {operatorInfo?.email || user.email || 'Operator'}
                </Text>
                <View style={styles.roleRow}>
                  <View style={[
                    styles.roleBadge,
                    { backgroundColor: operatorInfo?.is_admin ? 'rgba(196,138,44,0.15)' : 'rgba(62,79,60,0.3)' },
                  ]}>
                    <Text style={[
                      styles.roleText,
                      { color: operatorInfo?.is_admin ? TACTICAL.amber : TACTICAL.text },
                    ]}>
                      {(operatorInfo?.role || 'user').toUpperCase()}
                    </Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: operatorInfo?.status === 'active' ? 'rgba(62,107,62,0.2)' : 'rgba(192,57,43,0.2)' },
                  ]}>
                    <View style={[
                      styles.statusDot,
                      { backgroundColor: operatorInfo?.status === 'active' ? TACTICAL.success : TACTICAL.danger },
                    ]} />
                    <Text style={[
                      styles.statusText,
                      { color: operatorInfo?.status === 'active' ? TACTICAL.successText : TACTICAL.danger },
                    ]}>
                      {(operatorInfo?.status || 'active').toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{dirtyCount}</Text>
                <Text style={styles.statLabel}>PENDING</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{queueSize}</Text>
                <Text style={styles.statLabel}>QUEUED</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: isOnline ? '#4CAF50' : TACTICAL.textMuted }]}>
                  {syncStatus.toUpperCase()}
                </Text>
                <Text style={styles.statLabel}>SYNC</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={18} color={TACTICAL.danger} />
              <Text style={styles.signOutText}>{AUTH_COPY.logout.primary.toUpperCase()}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.noAuthSection}>
              <Ionicons name="person-circle-outline" size={40} color={TACTICAL.textMuted} />
              <Text style={styles.noAuthTitle}>{offlineMode ? 'Local Mode' : 'Not signed in'}</Text>
              <Text style={styles.noAuthDesc}>
                {offlineMode
                  ? 'Working with saved local data. Sign in when available to restore cloud sync, backup, and multi-device access.'
                  : AUTH_COPY.utility.publicAccessLine}
              </Text>
            </View>

            <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn} activeOpacity={0.7}>
              <Ionicons name="lock-open-outline" size={16} color={TACTICAL.text} />
              <Text style={styles.signInText}>{AUTH_COPY.account.signIn.toUpperCase()}</Text>
            </TouchableOpacity>

            {offlineMode ? (
              <Text style={styles.offlineNote}>
                ECS is keeping your saved local data available offline and will resume sync after sign-in.
              </Text>
            ) : null}
          </>
        )}

        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.closeBtnText}>CLOSE</Text>
        </TouchableOpacity>
      </View>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 18,
  },
  connectivitySection: {
    marginBottom: 4,
  },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  connectNote: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 4,
    lineHeight: 14,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(62,79,60,0.3)',
    marginVertical: 14,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.3)',
    borderRadius: 8,
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 1.5,
  },
  noAuthSection: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  noAuthTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
    marginTop: 8,
  },
  noAuthDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: TACTICAL.accent,
    borderRadius: 8,
    marginTop: 14,
  },
  signInText: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },
  offlineNote: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 14,
    opacity: 0.7,
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 8,
  },
  closeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
});





