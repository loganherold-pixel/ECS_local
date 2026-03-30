import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';
import TopoBackground from '../components/TopoBackground';
import TacticalInput from '../components/TacticalInput';

const APP_VERSION = '2.4.0';

interface ValidationRule {
  label: string;
  test: (val: string) => boolean;
}

const RULES: ValidationRule[] = [
  { label: 'At least 10 characters', test: (v) => v.length >= 10 },
  { label: 'Upper and lowercase letters', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: 'At least one number', test: (v) => /\d/.test(v) },
  { label: 'At least one symbol', test: (v) => /[^a-zA-Z0-9]/.test(v) },
];

export default function CreateAccessKeyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mode?: string }>();
  const email = params.email || '';
  // mode: 'signup' = direct new account creation
  // mode: 'recovery' or undefined = password update (from email link)
  const isSignupMode = params.mode === 'signup';

  const { signUp, updatePassword, user } = useApp();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Detect if user arrived via email recovery link (user is set but no email param)
  const isRecoveryFlow = !isSignupMode && !!user && !email;

  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const ruleResults = useMemo(() => {
    return RULES.map((rule) => ({
      ...rule,
      passed: rule.test(password),
    }));
  }, [password]);

  const allRulesPassed = ruleResults.every((r) => r.passed);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isFormValid = allRulesPassed && passwordsMatch;

  const confirmError = useMemo(() => {
    if (confirmPassword.length === 0) return '';
    if (!passwordsMatch) return "Passwords don't match";
    return '';
  }, [confirmPassword, passwordsMatch]);

  const handleActivate = async () => {
    setError('');

    if (!isFormValid) {
      triggerShake();
      return;
    }

    setLoading(true);

    if (isSignupMode) {
      // Direct signup flow: create new account with email + password
      if (!email) {
        setError('Email is missing. Please go back and enter your email.');
        setLoading(false);
        triggerShake();
        return;
      }

      const result = await signUp(email, password);
      setLoading(false);

      if (result.error) {
        setError(result.error);
        triggerShake();
      } else {
        setSuccess(true);
      }
    } else {
      // Recovery/update flow: update password for authenticated user
      const result = await updatePassword(password);
      setLoading(false);

      if (result.error) {
        setError(result.error);
        triggerShake();
      } else {
        setSuccess(true);
      }
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handleGoToApp = () => {
    router.replace('/(tabs)/trips');
  };

  const handleReturnToLogin = () => {
    router.replace('/login');
  };

  // Determine display email
  const displayEmail = email || user?.email || '';

  // Button label depends on flow
  const submitLabel = isSignupMode ? 'Create account' : 'Update password';
  const loadingLabel = isSignupMode ? 'Creating account...' : 'Updating...';

  if (success) {
    return (
      <TopoBackground>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.panel}>
            <View style={styles.header}>
              <View style={styles.successIconRow}>
                <Ionicons name="checkmark-circle" size={40} color={TACTICAL.successText} />
              </View>
              <Text style={styles.title}>
                {isSignupMode ? "You're almost there" : "You're all set"}
              </Text>
              <View style={styles.amberDivider} />
            </View>

            <View style={styles.form}>
              {isSignupMode ? (
                <View style={styles.successBox}>
                  <Ionicons name="mail" size={24} color={TACTICAL.successText} />
                  <Text style={styles.successTitle}>Verification sent</Text>
                  <Text style={styles.successSubtitle}>
                    Check your inbox to continue
                  </Text>
                  <Text style={styles.successDetail}>
                    A verification link has been sent to{'\n'}
                    <Text style={styles.emailHighlight}>{displayEmail}</Text>
                  </Text>
                  <Text style={styles.successNote}>
                    Verify your email, then sign in.
                  </Text>
                </View>
              ) : (
                <View style={styles.successBox}>
                  <Ionicons name="shield-checkmark" size={24} color={TACTICAL.successText} />
                  <Text style={styles.successTitle}>Password updated</Text>
                  <Text style={styles.successSubtitle}>
                    Your new password is ready to use
                  </Text>
                  {displayEmail ? (
                    <Text style={styles.successDetail}>
                      Account: <Text style={styles.emailHighlight}>{displayEmail}</Text>
                    </Text>
                  ) : null}
                </View>
              )}

              {isSignupMode ? (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleReturnToLogin}
                  activeOpacity={0.7}
                >
                  <Text style={styles.primaryBtnText}>Back to sign in</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleGoToApp}
                  activeOpacity={0.7}
                >
                  <View style={styles.loadingRow}>
                    <Ionicons name="arrow-forward" size={16} color="#0B0F12" />
                    <Text style={styles.primaryBtnText}>Continue to app</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.footer}>
            Secure connection  {'\u2022'}  ECS v{APP_VERSION}
          </Text>
        </ScrollView>
      </TopoBackground>
    );
  }

  return (
    <TopoBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.panel,
              { transform: [{ translateX: shakeAnim }] },
            ]}
          >
            {/* Back Button */}
            <TouchableOpacity
              style={styles.backBtn}
              onPress={handleBack}
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-back" size={20} color={TACTICAL.textMuted} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconRow}>
                <Ionicons name="lock-closed-outline" size={26} color={TACTICAL.amber} />
              </View>
              <Text style={styles.title}>
                {isSignupMode ? 'Create password' : 'Set new password'}
              </Text>
              {displayEmail ? (
                <Text style={styles.emailLabel}>
                  <Text style={styles.emailHighlight}>{displayEmail}</Text>
                </Text>
              ) : null}
              {isRecoveryFlow && (
                <View style={styles.recoveryBadge}>
                  <Ionicons name="link" size={12} color={TACTICAL.amber} />
                  <Text style={styles.recoveryBadgeText}>Via email link</Text>
                </View>
              )}
              <View style={styles.amberDivider} />
            </View>

            {/* Error Banner */}
            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color="#E57373" />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            {/* Form */}
            <View style={styles.form}>
              <TacticalInput
                label="Password"
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  setError('');
                }}
                placeholder="Create a password"
                isPassword
                returnKeyType="next"
              />

              {/* Validation Checklist */}
              <View style={styles.checklist}>
                {ruleResults.map((rule, idx) => (
                  <View key={idx} style={styles.checkItem}>
                    <View
                      style={[
                        styles.checkIcon,
                        rule.passed ? styles.checkIconPassed : styles.checkIconFailed,
                      ]}
                    >
                      <Ionicons
                        name={rule.passed ? 'checkmark' : 'close'}
                        size={12}
                        color={rule.passed ? TACTICAL.successText : TACTICAL.textMuted}
                      />
                    </View>
                    <Text
                      style={[
                        styles.checkLabel,
                        rule.passed ? styles.checkLabelPassed : styles.checkLabelFailed,
                      ]}
                    >
                      {rule.label}
                    </Text>
                  </View>
                ))}
              </View>

              <TacticalInput
                label="Confirm password"
                value={confirmPassword}
                onChangeText={(val) => {
                  setConfirmPassword(val);
                  setError('');
                }}
                placeholder="Re-enter your password"
                isPassword
                error={confirmError}
                returnKeyType="done"
                onSubmitEditing={handleActivate}
              />

              {/* Match indicator */}
              {confirmPassword.length > 0 && passwordsMatch && (
                <View style={styles.matchRow}>
                  <Ionicons name="checkmark-circle" size={14} color={TACTICAL.successText} />
                  <Text style={styles.matchText}>Passwords match</Text>
                </View>
              )}

              {/* Primary Button */}
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (!isFormValid || loading) && styles.primaryBtnDisabled,
                ]}
                onPress={handleActivate}
                disabled={!isFormValid || loading}
                activeOpacity={0.7}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#0B0F12" />
                    <Text style={styles.primaryBtnText}>{loadingLabel}</Text>
                  </View>
                ) : (
                  <View style={styles.loadingRow}>
                    <Ionicons name="arrow-forward" size={18} color="#0B0F12" />
                    <Text style={styles.primaryBtnText}>{submitLabel}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Footer */}
          <Text style={styles.footer}>
            Secure connection  {'\u2022'}  ECS v{APP_VERSION}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 40,
  },
  panel: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: TACTICAL.panel,
    borderRadius: TACTICAL.radius,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
  },
  header: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  iconRow: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(196, 138, 44, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIconRow: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(62, 107, 62, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(62, 107, 62, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: TACTICAL.text,
    textAlign: 'center',
    letterSpacing: 0.3,
    lineHeight: 30,
  },
  emailLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
    marginTop: 10,
  },
  emailHighlight: {
    color: TACTICAL.amber,
    fontWeight: '600',
  },
  recoveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  recoveryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: TACTICAL.amber,
    letterSpacing: 0.3,
  },
  amberDivider: {
    width: 60,
    height: 2,
    backgroundColor: TACTICAL.amber,
    marginTop: 16,
    borderRadius: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(229, 115, 115, 0.08)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(229, 115, 115, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorBannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#E57373',
    letterSpacing: 0.2,
    flex: 1,
    lineHeight: 18,
  },
  form: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    paddingTop: 8,
  },
  checklist: {
    backgroundColor: 'rgba(11, 15, 18, 0.5)',
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
    gap: 10,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  checkIconPassed: {
    backgroundColor: 'rgba(62, 107, 62, 0.25)',
    borderColor: TACTICAL.successText,
  },
  checkIconFailed: {
    backgroundColor: 'rgba(138, 138, 133, 0.1)',
    borderColor: 'rgba(138, 138, 133, 0.3)',
  },
  checkLabel: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  checkLabelPassed: {
    color: TACTICAL.successText,
  },
  checkLabelFailed: {
    color: TACTICAL.textMuted,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -16,
    marginBottom: 16,
  },
  matchText: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.successText,
    letterSpacing: 0.2,
  },
  primaryBtn: {
    backgroundColor: TACTICAL.amber,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0B0F12',
    letterSpacing: 0.3,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  successBox: {
    backgroundColor: 'rgba(62, 107, 62, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62, 107, 62, 0.3)',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TACTICAL.successText,
    letterSpacing: 0.3,
  },
  successSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  successDetail: {
    fontSize: 13,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  successNote: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    opacity: 0.7,
    marginTop: 4,
  },
  footer: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 28,
    opacity: 0.4,
  },
});




