/**
 * ECS Login Screen — Enterprise Refinement V5 (Cross-Platform Video Background)
 *
 * Layer stack (managed by AdaptiveBackground):
 *   z-0  Full-screen looping video (Intro_Login_Video.mp4)
 *        — Web: HTML5 <video> element
 *        — Native: expo-av Video component
 *        — Fallback: branded cinematic landscape image
 *   z-1  Dark tactical overlay (gradient)
 *   z-2  Subtle topographic ambient animation
 *   z-3  Login UI (this component — glass card with backdrop blur)
 *
 * Visual hierarchy (compact, no-scroll):
 *   [small top spacer]
 *   [ECS Badge Logo (image)]
 *   [Status row]
 *   [Glass card: Login form / Forgot Password]
 *   [Divider]
 *   [Continue offline]
 *   [Footer + version]
 *
 * Features:
 *   - Cinematic background video on ALL platforms (web + native)
 *   - Branded fallback image when video is loading or fails
 *   - Glass-morphism login card (backdrop-filter blur)
 *   - ECS badge logo with breathing + sweep animation
 *   - Forgot Password flow with email input + reset link
 *   - Adaptive dawn/night dynamic background
 *   - Premium motion throughout
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  TextInput,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';
import AdaptiveBackground from '../components/login/AdaptiveBackground';
import AnimatedShield from '../components/login/AnimatedShield';
import { exportLocalData } from '../lib/localDataExport';

const APP_VERSION = '2.4.0';
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

// ── Minimal top spacer — push form content up as high as possible ──
const TOP_SPACER = 0;

// ── Badge sizing — 25% larger for authoritative dominance ──
const BADGE_WIDTH = Math.min(SCREEN_W * 0.875, 388);




type ScreenMode = 'login' | 'forgot';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, isOnline, connectivityStatus, enterOfflineMode, sendPasswordReset } = useApp();
  let insets = { top: 0, bottom: 0 };
  try {
    insets = useSafeAreaInsets();
  } catch {}

  const [mode, setMode] = useState<ScreenMode>('login');
  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuspended, setIsSuspended] = useState(false);


  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ── Fade-in entrance ────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const isFormValid = email.trim().length > 0 && password.trim().length > 0;

  const handleLogin = async () => {
    setError('');
    setIsSuspended(false);

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      triggerShake();
      return;
    }

    setLoading(true);
    const result = await signIn(email.trim(), password, keepSignedIn);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      if (result.suspended) setIsSuspended(true);
      triggerShake();
    } else {
      router.replace('/(tabs)/dashboard');
    }
  };


  const handleForgotPassword = async () => {
    const trimmed = resetEmail.trim();
    if (!trimmed) {
      setResetError('Please enter your email address.');
      triggerShake();
      return;
    }

    // Basic email validation
    if (!trimmed.includes('@') || !trimmed.includes('.')) {
      setResetError('Please enter a valid email address.');
      triggerShake();
      return;
    }

    setResetLoading(true);
    setResetError('');

    const result = await sendPasswordReset(trimmed);
    setResetLoading(false);

    if (result.error) {
      setResetError(result.error);
      triggerShake();
    } else {
      setResetSent(true);
    }
  };

  const handleBackToLogin = () => {
    setMode('login');
    setResetEmail('');
    setResetError('');
    setResetSent(false);
  };

  const handleGoToForgot = () => {
    setMode('forgot');
    setError('');
    // Pre-fill with login email if available
    if (email.trim()) setResetEmail(email.trim());
  };

  const handleOfflineAccess = () => {
    enterOfflineMode();
    router.replace('/(tabs)/dashboard');
  };

  const handleSetup = () => {
    router.push('/initialize');
  };

  // ── Status config ───────────────────────────────────────────
  const getStatusConfig = () => {
    if (isOnline) {
      return { icon: 'wifi' as const, color: '#4CAF50', label: 'Online' };
    }
    if (connectivityStatus === 'reconnecting') {
      return { icon: 'wifi-outline' as const, color: TACTICAL.amber, label: 'Connecting...' };
    }
    return { icon: 'cloud-offline-outline' as const, color: TACTICAL.textMuted, label: 'Offline' };
  };

  const status = getStatusConfig();

  // ── Glass card style (web gets real backdrop-filter) ─────────
  const glassStyle = Platform.OS === 'web'
    ? {
        // @ts-ignore — web-only CSS property
        backdropFilter: 'blur(6px)',
        // @ts-ignore
        WebkitBackdropFilter: 'blur(6px)',
      }
    : {};

  return (
    <AdaptiveBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        <Animated.View
          style={[
            styles.content,
            {
              transform: [
                { translateX: shakeAnim },
                { translateY: slideAnim },
              ],
              opacity: fadeAnim,
              paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 4 : 8),

            },
          ]}
        >
          {/* ── Top spacer ───────────────────────────────── */}
          <View style={{ height: TOP_SPACER }} />

          {/* ── ECS Badge Logo ────────────────────────────── */}
          <View style={styles.badgeContainer}>
            <AnimatedShield badgeWidth={BADGE_WIDTH} />
          </View>

          {/* ── Status Row ───────────────────────────────── */}
          <View style={styles.statusRow}>
            <Ionicons name={status.icon} size={11} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
            {connectivityStatus === 'reconnecting' && (
              <ActivityIndicator size="small" color={TACTICAL.amber} style={{ marginLeft: 2 }} />
            )}
          </View>

          {/* ═══════════════════════════════════════════════ */}
          {/* GLASS CARD — Login / Forgot Password           */}
          {/* ═══════════════════════════════════════════════ */}
          <View style={[styles.glassCard, glassStyle]}>

            {/* ── Subtle top accent line ──────────────────── */}
            <View style={styles.glassAccentLine} />

            {/* ═══════════════════════════════════════════════ */}
            {/* LOGIN MODE                                     */}
            {/* ═══════════════════════════════════════════════ */}
            {mode === 'login' && (
              <>
                {/* ── Error Message ────────────────────────── */}
                {error ? (
                  <View style={[styles.errorRow, isSuspended && styles.errorRowSuspended]}>
                    <Ionicons
                      name={isSuspended ? 'lock-closed-outline' : 'alert-circle-outline'}
                      size={14}
                      color={isSuspended ? TACTICAL.amber : '#E57373'}
                    />
                    <Text style={[styles.errorText, isSuspended && styles.errorTextSuspended]}>
                      {error}
                    </Text>
                  </View>
                ) : null}

                {/* ── Form ─────────────────────────────────── */}
                <View style={styles.form}>
                  {/* Email */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Email</Text>
                    <View style={styles.inputRow}>
                      <Ionicons name="mail-outline" size={15} color={TACTICAL.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={(val) => { setEmail(val); setError(''); }}
                        placeholder="you@example.com"
                        placeholderTextColor="rgba(138,138,133,0.40)"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        editable={!loading}
                      />
                    </View>
                  </View>

                  {/* Password */}
                  <View style={styles.fieldGroup}>
                    <View style={styles.fieldLabelRow}>
                      <Text style={styles.fieldLabel}>Password</Text>
                      <TouchableOpacity
                        onPress={handleGoToForgot}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.forgotLink}>Forgot password?</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.inputRow}>
                      <Ionicons name="lock-closed-outline" size={15} color={TACTICAL.textMuted} style={styles.inputIcon} />
                      <TextInput
                        ref={passwordRef}
                        style={styles.input}
                        value={password}
                        onChangeText={(val) => { setPassword(val); setError(''); }}
                        placeholder="Enter your password"
                        placeholderTextColor="rgba(138,138,133,0.40)"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="password"
                        returnKeyType="go"
                        onSubmitEditing={handleLogin}
                        editable={!loading}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={17}
                          color={TACTICAL.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* ── Keep me signed in checkbox ──────────── */}
                  <TouchableOpacity
                    style={styles.keepSignedInRow}
                    onPress={() => setKeepSignedIn(!keepSignedIn)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <View style={[styles.checkbox, keepSignedIn && styles.checkboxChecked]}>
                      {keepSignedIn && (
                        <Ionicons name="checkmark" size={12} color="#0B0F12" />
                      )}
                    </View>
                    <Text style={styles.keepSignedInText}>Keep me signed in for 30 days</Text>
                  </TouchableOpacity>


                  {/* Sign In Button */}
                  <TouchableOpacity
                    style={[
                      styles.signInBtn,
                      (!isFormValid || loading) && styles.signInBtnDisabled,
                    ]}
                    onPress={handleLogin}
                    disabled={!isFormValid || loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <View style={styles.btnRow}>
                        <ActivityIndicator size="small" color="#0B0F12" />
                        <Text style={styles.signInText}>Signing in...</Text>
                      </View>
                    ) : (
                      <Text style={styles.signInText}>Sign in</Text>
                    )}
                  </TouchableOpacity>

                  {/* Offline note */}
                  {!isOnline && isFormValid && (
                    <Text style={styles.offlineNote}>
                      An internet connection is required to sign in.
                    </Text>
                  )}
                </View>
              </>
            )}

            {/* ═══════════════════════════════════════════════ */}
            {/* FORGOT PASSWORD MODE                           */}
            {/* ═══════════════════════════════════════════════ */}
            {mode === 'forgot' && (
              <>
                {!resetSent ? (
                  <>
                    {/* Header */}
                    <View style={styles.forgotHeader}>
                      <Text style={styles.forgotTitle}>Reset Password</Text>
                      <Text style={styles.forgotSubtitle}>
                        Enter your email address and we'll send you a link to reset your password.
                      </Text>
                    </View>

                    {/* Error */}
                    {resetError ? (
                      <View style={styles.errorRow}>
                        <Ionicons name="alert-circle-outline" size={14} color="#E57373" />
                        <Text style={styles.errorText}>{resetError}</Text>
                      </View>
                    ) : null}

                    {/* Email Input */}
                    <View style={styles.form}>
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Email</Text>
                        <View style={styles.inputRow}>
                          <Ionicons name="mail-outline" size={15} color={TACTICAL.textMuted} style={styles.inputIcon} />
                          <TextInput
                            style={styles.input}
                            value={resetEmail}
                            onChangeText={(val) => { setResetEmail(val); setResetError(''); }}
                            placeholder="you@example.com"
                            placeholderTextColor="rgba(138,138,133,0.40)"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="email"
                            returnKeyType="go"
                            onSubmitEditing={handleForgotPassword}
                            editable={!resetLoading}
                            autoFocus
                          />
                        </View>
                      </View>

                      {/* Send Reset Link Button */}
                      <TouchableOpacity
                        style={[
                          styles.signInBtn,
                          (!resetEmail.trim() || resetLoading) && styles.signInBtnDisabled,
                        ]}
                        onPress={handleForgotPassword}
                        disabled={!resetEmail.trim() || resetLoading}
                        activeOpacity={0.8}
                      >
                        {resetLoading ? (
                          <View style={styles.btnRow}>
                            <ActivityIndicator size="small" color="#0B0F12" />
                            <Text style={styles.signInText}>Sending...</Text>
                          </View>
                        ) : (
                          <Text style={styles.signInText}>Send Reset Link</Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Back to Sign In */}
                    <TouchableOpacity
                      style={styles.backToLoginBtn}
                      onPress={handleBackToLogin}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="arrow-back" size={14} color={TACTICAL.amber} />
                      <Text style={styles.backToLoginText}>Back to sign in</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {/* ── Success State ────────────────────── */}
                    <View style={styles.resetSuccessContainer}>
                      <View style={styles.resetSuccessIcon}>
                        <Ionicons name="checkmark-circle" size={40} color="#4CAF50" />
                      </View>
                      <Text style={styles.resetSuccessTitle}>Check Your Email</Text>
                      <Text style={styles.resetSuccessMsg}>
                        We sent a password reset link to{'\n'}
                        <Text style={styles.resetSuccessEmail}>{resetEmail}</Text>
                      </Text>
                      <Text style={styles.resetSuccessHint}>
                        If you don't see the email, check your spam folder. The link will expire in 24 hours.
                      </Text>

                      <TouchableOpacity
                        style={styles.returnBtn}
                        onPress={handleBackToLogin}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.signInText}>Return to Sign In</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </>
            )}
          </View>

          {/* ── Divider ──────────────────────────────────── */}
          {mode === 'login' && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* ── Continue Offline ──────────────────────── */}
              <TouchableOpacity
                style={styles.offlineBtn}
                onPress={handleOfflineAccess}
                activeOpacity={0.7}
              >
                <Ionicons name="phone-portrait-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.offlineBtnText}>Continue offline</Text>
              </TouchableOpacity>
              <Text style={styles.offlineHint}>
                {isOnline
                  ? 'Use the app with local data. Sign in later to sync.'
                  : "Offline \u2014 you can still use the app locally."}
              </Text>

              {/* ── Export Local Data ─────────────────────── */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 7, height: 38, marginTop: 10,
                  borderWidth: 1, borderColor: 'rgba(138,138,133,0.20)',
                  backgroundColor: 'rgba(138,138,133,0.04)', borderRadius: 10,
                }}
                onPress={async () => {
                  const result = await exportLocalData();
                  if (result.success) {
                    // silent success — file download triggers automatically on web
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="download-outline" size={14} color={TACTICAL.textMuted} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 0.3 }}>
                  Export local data
                </Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 9.5, color: TACTICAL.textMuted, textAlign: 'center', marginTop: 4, opacity: 0.40, lineHeight: 13 }}>
                Save your offline data as JSON before signing in.
              </Text>
            </>
          )}


          {/* ── Spacer ───────────────────────────────────── */}
          <View style={styles.spacer} />

          {/* ── Footer ───────────────────────────────────── */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleSetup} activeOpacity={0.6}>
              <Text style={styles.footerLink}>First time here? Set up account</Text>
            </TouchableOpacity>
            <Text style={styles.versionText}>v{APP_VERSION}</Text>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </AdaptiveBackground>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'flex-start',
  },

   // ── Badge ───────────────────────────────────────────────────
  badgeContainer: {
    alignItems: 'center',
    marginBottom: 0,
  },

  // ── Status ──────────────────────────────────────────────────
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 8,
    paddingVertical: 0,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ── Glass Card ──────────────────────────────────────────────
  glassCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  glassAccentLine: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.20)',
    borderRadius: 1,
  },

  // ── Error ───────────────────────────────────────────────────
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: 'rgba(229, 115, 115, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(229, 115, 115, 0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    marginTop: 8,
  },
  errorRowSuspended: {
    backgroundColor: 'rgba(196, 138, 44, 0.07)',
    borderColor: 'rgba(196, 138, 44, 0.18)',
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
    color: '#E57373',
    lineHeight: 17,
  },
  errorTextSuspended: {
    color: TACTICAL.amber,
  },

  // ── Form ────────────────────────────────────────────────────
  form: {
    gap: 0,
    marginTop: 6,
  },
  fieldGroup: {
    marginBottom: 10,
  },

  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginBottom: 4,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  forgotLink: {
    fontSize: 12,
    fontWeight: '500',
    color: TACTICAL.amber,
    opacity: 0.85,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 13,
    height: 46,
  },
  inputIcon: {
    marginRight: 9,
    opacity: 0.55,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: TACTICAL.text,
    fontWeight: '400',
    paddingVertical: 0,
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 4,
  },

  // ── Keep Signed In ──────────────────────────────────────────
  keepSignedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 10,
    paddingVertical: 1,
  },
  checkbox: {

    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(138,138,133,0.35)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: TACTICAL.amber,
    borderColor: TACTICAL.amber,
  },
  keepSignedInText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.2,
  },


  // ── Sign In Button ──────────────────────────────────────────
  signInBtn: {
    backgroundColor: TACTICAL.amber,
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    shadowColor: '#C48A2C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  signInBtnDisabled: {
    opacity: 0.40,
    shadowOpacity: 0,
  },
  signInText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0B0F12',
    letterSpacing: 0.5,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineNote: {
    fontSize: 11,
    color: TACTICAL.amber,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '500',
    opacity: 0.8,
  },

  // ── Divider ─────────────────────────────────────────────────
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },

  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(138,138,133,0.15)',
  },
  dividerText: {
    color: TACTICAL.textMuted,
    paddingHorizontal: 14,
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.5,
  },

  // ── Offline Button ──────────────────────────────────────────
  offlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.20)',
    backgroundColor: 'rgba(196, 138, 44, 0.04)',
    borderRadius: 10,
  },
  offlineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.amber,
    letterSpacing: 0.3,
  },
  offlineHint: {
    fontSize: 10.5,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginTop: 6,
    opacity: 0.50,
    lineHeight: 14,
  },

  // ── Forgot Password ─────────────────────────────────────────
  forgotHeader: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 10,
  },
  forgotTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  forgotSubtitle: {
    fontSize: 13,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  backToLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
  },
  backToLoginText: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.amber,
    letterSpacing: 0.3,
  },

  // ── Reset Success ───────────────────────────────────────────
  resetSuccessContainer: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  resetSuccessIcon: {
    marginBottom: 12,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetSuccessTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 1,
    marginBottom: 10,
  },
  resetSuccessMsg: {
    fontSize: 13,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 6,
  },
  resetSuccessEmail: {
    color: TACTICAL.text,
    fontWeight: '600',
  },
  resetSuccessHint: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.6,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  returnBtn: {
    backgroundColor: TACTICAL.amber,
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    shadowColor: '#C48A2C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },

  // ── Spacer ──────────────────────────────────────────────────
  spacer: {
    flex: 1,
    minHeight: 4,
  },

  // ── Footer ──────────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    gap: 6,
    paddingBottom: 2,
  },
  footerLink: {
    fontSize: 12,
    fontWeight: '500',
    color: TACTICAL.amber,
    opacity: 0.70,
  },
  versionText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    opacity: 0.30,
    letterSpacing: 0.8,
  },
});




