import React, { useState, useRef, useCallback } from 'react';
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
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';
import TopoBackground from '../components/TopoBackground';
import TacticalInput from '../components/TacticalInput';

const APP_VERSION = '2.4.0';

export default function InitializeScreen() {
  const router = useRouter();
  const { sendCredentialSetupLink } = useApp();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<'link' | 'direct'>('link');

  const shakeAnim = useRef(new Animated.Value(0)).current;

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

  const validateEmail = (val: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(val);
  };

  const isFormValid = email.trim().length > 0 && validateEmail(email.trim());

  const handleSendLink = async () => {
    setEmailError('');
    setError('');

    if (!email.trim()) {
      setEmailError('Email is required');
      triggerShake();
      return;
    }

    if (!validateEmail(email.trim())) {
      setEmailError('Invalid email format');
      triggerShake();
      return;
    }

    setLoading(true);

    const result = await sendCredentialSetupLink(email.trim());
    setLoading(false);

    if (result.error) {
      setError(result.error);
      triggerShake();
    } else {
      setSent(true);
    }
  };

  const handleDirectSetup = () => {
    setEmailError('');
    setError('');

    if (!email.trim()) {
      setEmailError('Email is required');
      triggerShake();
      return;
    }

    if (!validateEmail(email.trim())) {
      setEmailError('Invalid email format');
      triggerShake();
      return;
    }

    router.push({ pathname: '/create-access-key', params: { email: email.trim(), mode: 'signup' } });
  };

  const handleBack = () => {
    router.back();
  };

  // Success state after sending link
  if (sent) {
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
              <Text style={styles.title}>Email sent</Text>
              <View style={styles.amberDivider} />
            </View>

            <View style={styles.form}>
              <View style={styles.successBox}>
                <Ionicons name="mail" size={24} color={TACTICAL.successText} />
                <Text style={styles.successTitle}>Check your inbox</Text>
                <Text style={styles.successDetail}>
                  A setup link has been sent to{'\n'}
                  <Text style={styles.emailHighlight}>{email}</Text>
                </Text>
                <Text style={styles.successNote}>
                  Click the link in your email to set up your password.
                  You'll be redirected back to complete setup.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleBack}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryBtnText}>Back to sign in</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendLink}
                onPress={() => { setSent(false); setError(''); }}
                activeOpacity={0.6}
              >
                <Text style={styles.resendLinkText}>Resend link</Text>
              </TouchableOpacity>
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

            {/* Header Section */}
            <View style={styles.header}>
              <View style={styles.iconRow}>
                <Ionicons name="person-add-outline" size={26} color={TACTICAL.amber} />
              </View>
              <Text style={styles.title}>Set up account</Text>
              <Text style={styles.subtitle}>
                Enter your email to get started.
              </Text>
              <View style={styles.amberDivider} />
            </View>

            {/* Error Banner */}
            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={TACTICAL.danger} />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            {/* Form */}
            <View style={styles.form}>
              <TacticalInput
                label="Email"
                value={email}
                onChangeText={(val) => {
                  setEmail(val);
                  setEmailError('');
                  setError('');
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                error={emailError}
                returnKeyType="done"
                onSubmitEditing={mode === 'link' ? handleSendLink : handleDirectSetup}
              />

              {/* Mode Toggle */}
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeBtn, mode === 'link' && styles.modeBtnActive]}
                  onPress={() => setMode('link')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="mail-outline"
                    size={14}
                    color={mode === 'link' ? TACTICAL.text : TACTICAL.textMuted}
                  />
                  <Text style={[styles.modeBtnText, mode === 'link' && styles.modeBtnTextActive]}>
                    Email link
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, mode === 'direct' && styles.modeBtnActive]}
                  onPress={() => setMode('direct')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="flash-outline"
                    size={14}
                    color={mode === 'direct' ? TACTICAL.text : TACTICAL.textMuted}
                  />
                  <Text style={[styles.modeBtnText, mode === 'direct' && styles.modeBtnTextActive]}>
                    Direct setup
                  </Text>
                </TouchableOpacity>
              </View>

              {mode === 'link' ? (
                <>
                  {/* Send Setup Link Button */}
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      (!isFormValid || loading) && styles.primaryBtnDisabled,
                    ]}
                    onPress={handleSendLink}
                    disabled={!isFormValid || loading}
                    activeOpacity={0.7}
                  >
                    {loading ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color="#0B0F12" />
                        <Text style={styles.primaryBtnText}>Sending...</Text>
                      </View>
                    ) : (
                      <View style={styles.loadingRow}>
                        <Ionicons name="send" size={16} color="#0B0F12" />
                        <Text style={styles.primaryBtnText}>Send setup link</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.infoText}>
                    A secure link will be sent to your email.
                    Click it to set up your password.
                  </Text>
                </>
              ) : (
                <>
                  {/* Direct Setup Button */}
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      !isFormValid && styles.primaryBtnDisabled,
                    ]}
                    onPress={handleDirectSetup}
                    disabled={!isFormValid}
                    activeOpacity={0.7}
                  >
                    <View style={styles.loadingRow}>
                      <Ionicons name="arrow-forward" size={18} color="#0B0F12" />
                      <Text style={styles.primaryBtnText}>Continue</Text>
                    </View>
                  </TouchableOpacity>

                  <Text style={styles.infoText}>
                    Create your account and password directly.
                    A verification email will be sent to confirm your identity.
                  </Text>
                </>
              )}
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
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 18,
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
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    backgroundColor: 'transparent',
  },
  modeBtnActive: {
    backgroundColor: TACTICAL.accent,
    borderColor: TACTICAL.accent,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
  },
  modeBtnTextActive: {
    color: TACTICAL.text,
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
    gap: 12,
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TACTICAL.successText,
    letterSpacing: 0.3,
  },
  successDetail: {
    fontSize: 13,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  successNote: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    opacity: 0.7,
    marginTop: 4,
  },
  emailHighlight: {
    color: TACTICAL.amber,
    fontWeight: '700',
  },
  resendLink: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  resendLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.amber,
    letterSpacing: 0.2,
  },
  infoText: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 17,
    opacity: 0.7,
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




